import { MAX_TAVILY_SEARCHES_PER_BRIEF } from "@/lib/config/limits";

export class SearchBudgetExceededError extends Error {
  readonly limit: number;
  constructor(limit: number) {
    super(
      `Per-brief search limit reached (${limit} Tavily searches). Reduce the number of search queries.`,
    );
    this.name = "SearchBudgetExceededError";
    this.limit = limit;
  }
}

/**
 * Enforces the per-brief Tavily budget (spec section 3).
 *
 * Only cache misses consume the budget: a query answered from the 7-day file
 * cache costs no credit and is explicitly not counted.
 */
export class SearchBudget {
  private billable = 0;
  private cached = 0;

  constructor(readonly limit: number = MAX_TAVILY_SEARCHES_PER_BRIEF) {}

  /** Searches that consumed a credit. */
  get billableCount(): number {
    return this.billable;
  }

  /** Searches answered from cache; free and uncounted. */
  get cachedCount(): number {
    return this.cached;
  }

  get remaining(): number {
    return Math.max(0, this.limit - this.billable);
  }

  get exhausted(): boolean {
    return this.billable >= this.limit;
  }

  recordCacheHit(): void {
    this.cached += 1;
  }

  /**
   * Reserves one billable search. Must be called before the network call so
   * concurrent or sequential callers cannot overshoot the limit.
   */
  reserve(): void {
    if (this.billable >= this.limit) {
      throw new SearchBudgetExceededError(this.limit);
    }
    this.billable += 1;
  }
}
