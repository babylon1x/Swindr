import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  AiOutputError,
  AiQuotaError,
  AiRequestError,
  GeminiProvider,
} from "@/lib/ai/client";
import {
  MAX_AI_VALIDATION_RETRIES,
  MAX_AVAILABILITY_RETRIES,
} from "@/lib/config/limits";

/**
 * The provider is exercised through a stubbed `generateContent`, so these tests
 * assert the request caps in section 3 (exactly 3 AI calls per brief, at most
 * one validation retry each) without touching the network.
 */
function stubProvider(responses: (() => unknown)[]) {
  const provider = new GeminiProvider();
  const calls: unknown[] = [];

  // getClient is private; overriding it isolates the transport.
  (provider as unknown as { getClient: () => unknown }).getClient = () => ({
    models: {
      generateContent: async (request: unknown) => {
        calls.push(request);
        const next = responses.shift();
        if (!next) throw new Error("no stubbed response left");
        return next();
      },
    },
  });

  return { provider, calls };
}

function ok(text: string) {
  return () => ({ text });
}

function boom(error: unknown) {
  return () => {
    throw error;
  };
}

const options = {
  model: "fast" as const,
  system: "system",
  user: "user",
  schema: { type: "OBJECT" } as Record<string, unknown>,
};

const passthrough = z.object({ value: z.string() });

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/**
 * Collapses the provider's retry backoff to zero while keeping real timers, so
 * the retry logic is exercised without waiting seconds or deadlocking on
 * faked timers.
 */
function instantSleeps() {
  const realSetTimeout = globalThis.setTimeout;
  vi.spyOn(globalThis, "setTimeout").mockImplementation(
    ((callback: (...args: unknown[]) => void) =>
      realSetTimeout(callback, 0)) as typeof globalThis.setTimeout,
  );
}

describe("structured output validation", () => {
  it("returns parsed output on the first try", async () => {
    const { provider, calls } = stubProvider([ok(JSON.stringify({ value: "ok" }))]);

    const result = await provider.generateJson(options, passthrough);

    expect(result).toEqual({ value: "ok" });
    expect(calls).toHaveLength(1);
  });

  it("retries exactly once on schema failure, then accepts", async () => {
    const { provider, calls } = stubProvider([
      ok(JSON.stringify({ wrong: true })),
      ok(JSON.stringify({ value: "fixed" })),
    ]);

    const result = await provider.generateJson(options, passthrough);

    expect(result).toEqual({ value: "fixed" });
    expect(calls).toHaveLength(MAX_AI_VALIDATION_RETRIES + 1);
  });

  it("retries once on invalid JSON", async () => {
    const { provider, calls } = stubProvider([
      ok("this is not json"),
      ok(JSON.stringify({ value: "fixed" })),
    ]);

    const result = await provider.generateJson(options, passthrough);
    expect(result).toEqual({ value: "fixed" });
    expect(calls).toHaveLength(2);
  });

  it("gives up after the single retry and reports unusable output", async () => {
    const { provider, calls } = stubProvider([
      ok("nope"),
      ok("still nope"),
      ok("never reached"),
    ]);

    await expect(provider.generateJson(options, passthrough)).rejects.toBeInstanceOf(
      AiOutputError,
    );
    expect(calls).toHaveLength(MAX_AI_VALIDATION_RETRIES + 1);
  });

  it("treats an empty response as a retryable failure", async () => {
    const { provider, calls } = stubProvider([
      ok(""),
      ok(JSON.stringify({ value: "second" })),
    ]);

    const result = await provider.generateJson(options, passthrough);
    expect(result).toEqual({ value: "second" });
    expect(calls).toHaveLength(2);
  });

  it("includes the validation errors in the retry prompt", async () => {
    const { provider, calls } = stubProvider([
      ok(JSON.stringify({ wrong: true })),
      ok(JSON.stringify({ value: "fixed" })),
    ]);

    await provider.generateJson(options, passthrough);

    const retryRequest = calls[1] as { contents: { parts: { text: string }[] }[] };
    const retryText = retryRequest.contents[0].parts[0].text;
    expect(retryText).toMatch(/failed validation/i);
  });
});

describe("quota handling", () => {
  it("fails immediately on 429 with no retry", async () => {
    const { provider, calls } = stubProvider([boom({ status: 429, message: "quota" })]);

    await expect(provider.generateJson(options, passthrough)).rejects.toBeInstanceOf(
      AiQuotaError,
    );
    expect(calls).toHaveLength(1);
  });

  it("recognises a quota error reported only in the message", async () => {
    const { provider, calls } = stubProvider([
      boom(new Error("RESOURCE_EXHAUSTED: quota exceeded for this project")),
    ]);

    await expect(provider.generateJson(options, passthrough)).rejects.toBeInstanceOf(
      AiQuotaError,
    );
    expect(calls).toHaveLength(1);
  });

  it("reads a retryDelay out of a 429 body", async () => {
    const { provider } = stubProvider([
      boom(
        new Error('{"retryDelay": "42s"} quota exhausted'),
      ),
    ]);

    const error = await provider
      .generateJson(options, passthrough)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AiQuotaError);
    const retryAt = (error as AiQuotaError).retryAt;
    expect(retryAt).toBeInstanceOf(Date);
    expect((retryAt as Date).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("availability retries", () => {
  it("retries a 503 and succeeds within the cap", async () => {
    instantSleeps();
    const { provider, calls } = stubProvider([
      boom({ status: 503, message: "UNAVAILABLE: high demand" }),
      ok(JSON.stringify({ value: "recovered" })),
    ]);

    await expect(provider.generateJson(options, passthrough)).resolves.toEqual({
      value: "recovered",
    });
    expect(calls).toHaveLength(2);
  });

  it("stops after MAX_AVAILABILITY_RETRIES retries and reports failure", async () => {
    instantSleeps();
    const { provider, calls } = stubProvider(
      Array.from({ length: MAX_AVAILABILITY_RETRIES + 5 }, () =>
        boom({ status: 503, message: "UNAVAILABLE: high demand" }),
      ),
    );

    await expect(provider.generateJson(options, passthrough)).rejects.toBeInstanceOf(
      AiRequestError,
    );

    // One initial attempt plus the capped retries.
    expect(calls).toHaveLength(MAX_AVAILABILITY_RETRIES + 1);
  });

  it("does not retry a plain 400", async () => {
    const { provider, calls } = stubProvider([boom({ status: 400, message: "bad request" })]);

    await expect(provider.generateJson(options, passthrough)).rejects.toBeInstanceOf(
      AiRequestError,
    );
    expect(calls).toHaveLength(1);
  });
});

describe("request shape", () => {
  it("sends the system prompt, JSON mime type and schema", async () => {
    const { provider, calls } = stubProvider([ok(JSON.stringify({ value: "ok" }))]);

    await provider.generateJson(options, passthrough);

    const request = calls[0] as {
      model: string;
      contents: { role: string; parts: { text: string }[] }[];
      config: Record<string, unknown>;
    };
    expect(request.contents[0].role).toBe("user");
    expect(request.contents[0].parts[0].text).toBe("user");
    expect(request.config.systemInstruction).toBe("system");
    expect(request.config.responseMimeType).toBe("application/json");
    expect(request.config.responseSchema).toEqual({ type: "OBJECT" });
  });

  it("labels each screenshot so the model can map image to domain", async () => {
    const { provider, calls } = stubProvider([ok(JSON.stringify({ value: "ok" }))]);

    await provider.generateJson(
      {
        ...options,
        images: [
          { mimeType: "image/jpeg", data: "AAA", label: "Alpha (alpha.com)" },
          { mimeType: "image/jpeg", data: "BBB", label: "Beta (beta.com)" },
        ],
      },
      passthrough,
    );

    const request = calls[0] as {
      contents: { parts: ({ text?: string; inlineData?: { data: string } })[] }[];
    };
    const parts = request.contents[0].parts;

    // [0] user text, then a label + image pair per screenshot.
    expect(parts).toHaveLength(5);
    expect(parts[0].text).toBe("user");
    expect(parts[1].text).toContain("Alpha (alpha.com)");
    expect(parts[2].inlineData?.data).toBe("AAA");
    expect(parts[3].text).toContain("Beta (beta.com)");
    expect(parts[4].inlineData?.data).toBe("BBB");
  });

  it("uses the fast and smart model slots", async () => {
    const { provider, calls } = stubProvider([
      ok(JSON.stringify({ value: "a" })),
      ok(JSON.stringify({ value: "b" })),
    ]);

    await provider.generateJson({ ...options, model: "fast" }, passthrough);
    await provider.generateJson({ ...options, model: "smart" }, passthrough);

    expect((calls[0] as { model: string }).model).toBe("gemini-3.5-flash-lite");
    expect((calls[1] as { model: string }).model).toBe("gemini-3.5-flash");
  });
});