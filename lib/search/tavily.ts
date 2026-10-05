import { getTavilyApiKey } from "@/lib/config/env";
import {
  TAVILY_RESULTS_PER_QUERY,
  TAVILY_SEARCH_DEPTH,
} from "@/lib/config/limits";
import { recordTavilySearch } from "@/lib/storage/usage";
import { readCache, writeCache, type CachedResult } from "./cache";
import type { SearchBudget } from "./budget";

/**
 * Tavily REST client using fetch (spec section 5). Endpoint and parameters
 * taken from Tavily's current API reference: POST /search, bearer auth,
 * search_depth basic costs 1 credit.
 */

const TAVILY_ENDPOINT = "https://api.tavily.com/search";

export class TavilyError extends Error {
  readonly status?: number;
  readonly retryAfterSeconds?: number;

  constructor(message: string, status?: number, retryAfterSeconds?: number) {
    super(message);
    this.name = "TavilyError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface SearchOptions {
  query: string;
  maxResults?: number;
  signal?: AbortSignal;
  /** Enforces the per-brief credit budget. Required. */
  budget: SearchBudget;
}

export interface SearchOutcome {
  query: string;
  results: CachedResult[];
  fromCache: boolean;
}

/**
 * Runs one basic-depth search, reading from / writing to the 7-day cache.
 *
 * Cache hits cost no credit and do not count against the per-brief limit.
 * Cache misses reserve one unit from the budget before the network call, so
 * the limit cannot be overshot.
 */
export async function searchOnce(options: SearchOptions): Promise<SearchOutcome> {
  const query = options.query.trim();

  const cached = await readCache(query);
  if (cached) {
    options.budget.recordCacheHit();
    return { query, results: cached, fromCache: true };
  }

  // Throws SearchBudgetExceededError when the brief is out of credits.
  options.budget.reserve();

  const response = await callTavily(query, options);

  await recordTavilySearch(1);
  await writeCache(query, response);

  return { query, results: response, fromCache: false };
}

async function callTavily(
  query: string,
  options: SearchOptions,
): Promise<CachedResult[]> {
  let response: Response;
  try {
    response = await fetch(TAVILY_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${getTavilyApiKey()}`,
      },
      body: JSON.stringify({
        query,
        search_depth: TAVILY_SEARCH_DEPTH,
        max_results: options.maxResults ?? TAVILY_RESULTS_PER_QUERY,
        include_answer: false,
        include_raw_content: false,
        include_images: false,
      }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    throw new TavilyError(
      `Tavily request failed: ${
        error instanceof Error ? error.message : "network error"
      }`,
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const detail = extractTavilyError(body);
    const retryAfter = Number(response.headers.get("retry-after") ?? "");

    if (response.status === 401 || response.status === 403) {
      throw new TavilyError(
        `Tavily rejected the API key (HTTP ${response.status}). Check TAVILY_API_KEY in .env.local.${detail ? ` ${detail}` : ""}`,
        response.status,
      );
    }
    if (response.status === 429 || response.status === 432 || response.status === 433) {
      throw new TavilyError(
        `Tavily limit reached (HTTP ${response.status})${detail ? `: ${detail}` : "."} No credits remain this month — wait for the monthly reset or reduce briefs.`,
        response.status,
        Number.isFinite(retryAfter) ? retryAfter : undefined,
      );
    }
    throw new TavilyError(
      `Tavily error (HTTP ${response.status})${detail ? `: ${detail}` : "."}`,
      response.status,
      Number.isFinite(retryAfter) ? retryAfter : undefined,
    );
  }

  const payload = (await response.json()) as {
    results?: { title?: string; url?: string; content?: string; score?: number }[];
  };

  return (payload.results ?? [])
    .filter((result) => typeof result.url === "string" && result.url !== "")
    .map((result) => ({
      title: result.title ?? "",
      url: result.url as string,
      content: result.content ?? "",
      ...(typeof result.score === "number" ? { score: result.score } : {}),
    }));
}

function extractTavilyError(body: string): string {
  if (!body) return "";
  try {
    const parsed = JSON.parse(body) as { detail?: { error?: string } | string };
    const detail = parsed.detail;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object" && detail.error) return detail.error;
  } catch {
    // fall through to the raw snippet
  }
  return body.slice(0, 200);
}
