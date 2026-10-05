import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import path from "path";
import { readCache, writeCache, type CachedResult } from "@/lib/search/cache";
import { SearchBudget, SearchBudgetExceededError } from "@/lib/search/budget";
import { searchOnce, TavilyError } from "@/lib/search/tavily";
import { TAVILY_CACHE_DIR } from "@/lib/storage/paths";
import { MAX_TAVILY_SEARCHES_PER_BRIEF } from "@/lib/config/limits";

const results: CachedResult[] = [
  { title: "Alpha", url: "https://alpha.com/", content: "Alpha does the thing." },
];

beforeEach(async () => {
  // Start each test from an empty cache.
  await fs.rm(TAVILY_CACHE_DIR, { recursive: true, force: true });
  process.env.TAVILY_API_KEY = "test-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockFetchOnce(payload: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify(payload), {
      status: ok ? status : status,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("SearchBudget", () => {
  it("allows exactly the per-brief limit", () => {
    const budget = new SearchBudget();
    for (let i = 0; i < MAX_TAVILY_SEARCHES_PER_BRIEF; i += 1) budget.reserve();
    expect(budget.billableCount).toBe(MAX_TAVILY_SEARCHES_PER_BRIEF);
    expect(budget.remaining).toBe(0);
    expect(budget.exhausted).toBe(true);
  });

  it("throws on the search past the limit", () => {
    const budget = new SearchBudget(2);
    budget.reserve();
    budget.reserve();
    expect(() => budget.reserve()).toThrow(SearchBudgetExceededError);
    expect(budget.billableCount).toBe(2);
  });

  it("names the limit in the error message", () => {
    const budget = new SearchBudget(1);
    budget.reserve();
    expect(() => budget.reserve()).toThrow(/1 Tavily searches/);
  });

  it("does not spend budget on cache hits", () => {
    const budget = new SearchBudget(1);
    budget.recordCacheHit();
    budget.recordCacheHit();
    expect(budget.billableCount).toBe(0);
    expect(budget.cachedCount).toBe(2);
    expect(budget.exhausted).toBe(false);
  });

  it("defaults to the spec limit", () => {
    expect(MAX_TAVILY_SEARCHES_PER_BRIEF).toBe(8);
    expect(new SearchBudget().limit).toBe(8);
  });
});

describe("Tavily cache", () => {
  it("misses on an unknown query", async () => {
    await expect(readCache("never searched")).resolves.toBeNull();
  });

  it("hits after a write", async () => {
    await writeCache("portfolio feedback app", results);
    await expect(readCache("portfolio feedback app")).resolves.toEqual(results);
  });

  it("is keyed on the exact query string", async () => {
    await writeCache("exact query", results);
    await expect(readCache("Exact Query")).resolves.toBeNull();
    await expect(readCache("exact query extra")).resolves.toBeNull();
  });

  it("expires after the TTL", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    await writeCache("aged query", results, now);

    const withinTtl = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);
    await expect(readCache("aged query", withinTtl)).resolves.toEqual(results);

    const pastTtl = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);
    await expect(readCache("aged query", pastTtl)).resolves.toBeNull();
  });

  it("ignores a corrupt cache file", async () => {
    await fs.mkdir(TAVILY_CACHE_DIR, { recursive: true });
    const files = await fs.readdir(TAVILY_CACHE_DIR);
    // Write garbage into every cache slot, then confirm a clean miss.
    for (const file of files) {
      await fs.writeFile(path.join(TAVILY_CACHE_DIR, file), "not json");
    }
    await expect(readCache("anything")).resolves.toBeNull();
  });
});

describe("searchOnce", () => {
  it("calls Tavily on a cache miss and records the credit", async () => {
    const fetchMock = mockFetchOnce({ results });

    const outcome = await searchOnce({ query: "fresh query", budget: new SearchBudget() });

    expect(outcome.fromCache).toBe(false);
    expect(outcome.results).toEqual(results);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.search_depth).toBe("basic");
    expect(body.query).toBe("fresh query");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer test-key");
  });

  it("serves a cache hit without calling Tavily or spending a credit", async () => {
    await writeCache("warm query", results);
    const fetchMock = mockFetchOnce({ results: [] });
    const budget = new SearchBudget();

    const outcome = await searchOnce({ query: "warm query", budget });

    expect(outcome.fromCache).toBe(true);
    expect(outcome.results).toEqual(results);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(budget.billableCount).toBe(0);
    expect(budget.cachedCount).toBe(1);
  });

  it("drops results with no url", async () => {
    mockFetchOnce({ results: [{ title: "No url", content: "x" }] });
    const outcome = await searchOnce({ query: "url-less", budget: new SearchBudget() });
    expect(outcome.results).toEqual([]);
  });

  it("names Tavily on an auth error", async () => {
    mockFetchOnce({ detail: { error: "invalid key" } }, false, 401);
    await expect(
      searchOnce({ query: "auth", budget: new SearchBudget() }),
    ).rejects.toThrow(/Tavily.*TAVILY_API_KEY/s);
  });

  it("explains a credit limit without retrying", async () => {
    const fetchMock = mockFetchOnce({ detail: "no credits" }, false, 429);
    await expect(
      searchOnce({ query: "limit", budget: new SearchBudget() }),
    ).rejects.toThrow(/Tavily limit reached/);
    // No automatic retries on limit errors.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses to call Tavily once the brief's budget is spent", async () => {
    const budget = new SearchBudget(1);
    budget.reserve();
    const fetchMock = mockFetchOnce({ results });

    await expect(
      searchOnce({ query: "over budget", budget }),
    ).rejects.toThrow(SearchBudgetExceededError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops the whole brief after MAX_TAVILY_SEARCHES_PER_BRIEF queries", async () => {
    const fetchMock = mockFetchOnce({ results });
    const budget = new SearchBudget();

    let thrown: unknown;
    for (let i = 0; i < MAX_TAVILY_SEARCHES_PER_BRIEF + 1; i += 1) {
      try {
        // Distinct queries so nothing is served from cache.
        await searchOnce({ query: `unique query ${i}`, budget });
      } catch (error) {
        thrown = error;
        break;
      }
    }

    expect(thrown).toBeInstanceOf(SearchBudgetExceededError);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_TAVILY_SEARCHES_PER_BRIEF);
    expect(budget.billableCount).toBe(MAX_TAVILY_SEARCHES_PER_BRIEF);
  });

  it("surfaces a Tavily network failure as TavilyError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    await expect(
      searchOnce({ query: "offline", budget: new SearchBudget() }),
    ).rejects.toBeInstanceOf(TavilyError);
  });
});