import type { z } from "zod";
import { GoogleGenAI, ApiError } from "@google/genai";
import { getFastModel, getGeminiApiKey, getSmartModel } from "@/lib/config/env";
import { recordGeminiRequest } from "@/lib/storage/usage";
import {
  AVAILABILITY_RETRY_BASE_MS,
  MAX_AI_VALIDATION_RETRIES,
  MAX_AVAILABILITY_RETRIES,
} from "@/lib/config/limits";

/** Gemini quota exhausted (HTTP 429). Section 9: never auto-retry. */
export class AiQuotaError extends Error {
  readonly retryAt?: Date;
  constructor(message: string, retryAt?: Date) {
    super(message);
    this.name = "AiQuotaError";
    this.retryAt = retryAt;
  }
}

/** Output failed zod validation twice. */
export class AiOutputError extends Error {
  readonly issues: string;
  constructor(message: string, issues: string) {
    super(message);
    this.name = "AiOutputError";
    this.issues = issues;
  }
}

/** Any other provider failure. */
export class AiRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiRequestError";
  }
}

export type ModelSlot = "fast" | "smart";

/**
 * Gemini returned a successful response with no text. This is an output
 * problem, not a transport one, so it is retried once like a schema failure
 * rather than surfaced as a hard error.
 */
class EmptyResponseError extends Error {
  constructor() {
    super("Gemini returned an empty response.");
    this.name = "EmptyResponseError";
  }
}

export interface AiImage {
  mimeType: string;
  /** base64, no data: prefix. */
  data: string;
  /**
   * Prepended as a text part so the model knows which site each screenshot
   * belongs to. Without it the model cannot reliably map an image to a domain.
   */
  label?: string;
}

export interface GenerateJsonOptions {
  model: ModelSlot;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  images?: AiImage[];
  temperature?: number;
}

/**
 * Small interface so the provider can be swapped later. Only Gemini is
 * implemented (spec section 6, section 13).
 */
export interface AiProvider {
  generateJson<T>(
    options: GenerateJsonOptions,
    schema: z.ZodType<T>,
  ): Promise<T>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusOf(error: unknown): number | undefined {
  if (error instanceof ApiError) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") return status;
    const code = (error as { code?: unknown }).code;
    if (typeof code === "number") return code;
  }
  if (error && typeof error === "object") {
    for (const key of ["status", "code", "httpStatus"] as const) {
      const value = (error as Record<string, unknown>)[key];
      if (typeof value === "number") return value;
    }
  }
  return undefined;
}

function isQuotaError(error: unknown, status: number | undefined): boolean {
  if (status === 429) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /\b429\b|RESOURCE_EXHAUSTED|\bquota\b|rate limit/i.test(message);
}

/** Pulls a retry time out of a 429 body when Google provides one. */
function quotaRetryAt(raw: string): Date | undefined {
  const match =
    /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(raw) ??
    /retry in (\d+(?:\.\d+)?)s/i.exec(raw);
  if (!match) return undefined;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds)) return undefined;
  return new Date(Date.now() + seconds * 1000);
}

/**
 * Google's error bodies are long JSON blobs that mean nothing in the UI. Lift
 * `error.message` out when possible and otherwise keep the first line, so a
 * failed brief shows a readable reason instead of a wall of text.
 */
export function summariseProviderError(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "Unknown Gemini error.";

  const jsonStart = trimmed.indexOf("{");
  if (jsonStart !== -1) {
    try {
      const parsed = JSON.parse(trimmed.slice(jsonStart)) as {
        error?: { message?: unknown };
        message?: unknown;
      };
      const message = parsed.error?.message ?? parsed.message;
      if (typeof message === "string" && message.trim()) {
        return summariseProviderError(message.trim());
      }
    } catch {
      // Not JSON after all; fall through to the raw-text handling below.
    }
  }

  const firstLine = trimmed.split("\n")[0].trim();
  return firstLine.length > 220 ? `${firstLine.slice(0, 217)}...` : firstLine;
}

export class GeminiProvider implements AiProvider {
  private client: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI {
    if (!this.client) {
      this.client = new GoogleGenAI({ apiKey: getGeminiApiKey() });
    }
    return this.client;
  }

  private modelName(slot: ModelSlot): string {
    return slot === "fast" ? getFastModel() : getSmartModel();
  }

  /**
   * One generateContent call. Retries only on 503 UNAVAILABLE ("high demand"),
   * which is an availability signal rather than a quota one.
   */
  private async callOnce(
    options: GenerateJsonOptions,
    userText: string,
  ): Promise<string> {
    const parts: Record<string, unknown>[] = [{ text: userText }];
    for (const image of options.images ?? []) {
      if (image.label) {
        parts.push({ text: `Homepage screenshot of ${image.label}:` });
      }
      parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
    }

    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_AVAILABILITY_RETRIES; attempt += 1) {
      try {
        // Count every request actually sent, successful or not. A local write
        // failure must never turn a good provider response into an error.
        try {
          await recordGeminiRequest(1);
        } catch {
          // Usage meter is best-effort.
        }

        const response = await this.getClient().models.generateContent({
          model: this.modelName(options.model),
          contents: [{ role: "user", parts }],
          config: {
            systemInstruction: options.system,
            responseMimeType: "application/json",
            responseSchema: options.schema,
            temperature: options.temperature ?? 0.3,
          },
        });
        const text = response.text;
        if (!text || text.trim() === "") {
          throw new EmptyResponseError();
        }
        return text;
      } catch (error) {
        lastError = error;
        if (error instanceof EmptyResponseError) throw error;
        const status = statusOf(error);

        if (isQuotaError(error, status)) {
          const raw = error instanceof Error ? error.message : String(error);
          throw new AiQuotaError(
            "Gemini rate limit or quota exceeded.",
            quotaRetryAt(raw),
          );
        }

        const isAvailability =
          status === 503 || /UNAVAILABLE|high demand|overloaded/i.test(
            error instanceof Error ? error.message : String(error),
          );

        if (isAvailability && attempt < MAX_AVAILABILITY_RETRIES) {
          await sleep(AVAILABILITY_RETRY_BASE_MS * (attempt + 1));
          continue;
        }

        if (error instanceof AiRequestError) throw error;

        const message = summariseProviderError(
          error instanceof Error ? error.message : String(error),
        );
        throw new AiRequestError(
          `Gemini request failed${status ? ` (HTTP ${status})` : ""}: ${message}`,
        );
      }
    }

    const message = summariseProviderError(
      lastError instanceof Error ? lastError.message : String(lastError),
    );
    throw new AiRequestError(`Gemini request failed: ${message}`);
  }

  /**
   * Structured output + zod validation. On validation failure, retries once
   * with the error message included (spec section 6).
   */
  async generateJson<T>(
    options: GenerateJsonOptions,
    schema: z.ZodType<T>,
  ): Promise<T> {
    let userText = options.user;
    let lastIssues = "";

    for (let attempt = 0; attempt <= MAX_AI_VALIDATION_RETRIES; attempt += 1) {
      let raw: string;
      try {
        raw = await this.callOnce(options, userText);
      } catch (error) {
        // An empty reply gets the same single retry as a validation failure.
        if (!(error instanceof EmptyResponseError)) throw error;

        lastIssues = "The response was empty.";
        if (attempt < MAX_AI_VALIDATION_RETRIES) {
          userText = `${options.user}\n\nYour previous reply was empty. Return the complete JSON object matching the required schema.`;
          continue;
        }
        throw new AiOutputError(
          "Gemini returned output that could not be validated.",
          lastIssues,
        );
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        lastIssues = "The response was not valid JSON.";
        if (attempt < MAX_AI_VALIDATION_RETRIES) {
          userText = `${options.user}\n\nYour previous reply was rejected: ${lastIssues}\nReturn only valid JSON matching the required schema.`;
          continue;
        }
        throw new AiOutputError(
          "Gemini returned output that could not be validated.",
          lastIssues,
        );
      }

      const result = schema.safeParse(parsed);
      if (result.success) return result.data;

      lastIssues = result.error.issues
        .map(
          (issue) =>
            `${issue.path.join(".") || "(root)"}: ${issue.message}`,
        )
        .join("; ");

      if (attempt < MAX_AI_VALIDATION_RETRIES) {
        userText = `${options.user}\n\nYour previous reply failed validation with these errors:\n${lastIssues}\n\nFix exactly these problems and return the full corrected JSON object.`;
        continue;
      }
    }

    throw new AiOutputError(
      "Gemini returned output that could not be validated.",
      lastIssues,
    );
  }
}

let provider: AiProvider | null = null;

export function getAiProvider(): AiProvider {
  if (!provider) provider = new GeminiProvider();
  return provider;
}

/** Test seam. */
export function setAiProvider(next: AiProvider | null): void {
  provider = next;
}
