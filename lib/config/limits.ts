/**
 * Every hard limit from the spec lives here as a named constant.
 * Section 3 "per-brief budget" and section 7 pipeline caps.
 * Nothing else in the codebase may hardcode these numbers.
 */

// --- Section 3: per-brief budget -----------------------------------------

/** At most 8 Tavily searches per brief, basic depth only. */
export const MAX_TAVILY_SEARCHES_PER_BRIEF = 8;

/** Exactly 3 AI requests per brief (profile, candidates, analysis). */
export const AI_REQUESTS_PER_BRIEF = 3;

/** At most 1 retry per AI request when output fails validation. */
export const MAX_AI_VALIDATION_RETRIES = 1;

/** At most 20 candidates go to verification. */
export const MAX_CANDIDATES_TO_VERIFY = 20;

/** At most 15 verified candidates are analyzed. */
export const MAX_COMPETITORS_ANALYZED = 15;

// --- Section 7, step 1: idea profile -------------------------------------

export const IDEA_MIN_CHARS = 20;
export const IDEA_MAX_CHARS = 3000;
export const TARGET_CUSTOMER_MAX_CHARS = 300;
export const MARKET_MAX_CHARS = 100;
export const DEFAULT_MARKET = "Global";

/** Search queries: AI returns 4-8; the editor may not exceed 8. */
export const MIN_SEARCH_QUERIES = 4;
export const MAX_SEARCH_QUERIES = 8;

// --- Section 7, step 2: search -------------------------------------------

/** Tavily basic depth returns up to 8 results per query. */
export const TAVILY_RESULTS_PER_QUERY = 8;
export const TAVILY_SEARCH_DEPTH = "basic" as const;

/** Cached queries cost no credits and do not count against the brief limit. */
export const TAVILY_CACHE_TTL_DAYS = 7;

// --- Section 7, step 3: verification -------------------------------------

export const VERIFY_CONCURRENCY = 3;
export const VERIFY_TIMEOUT_MS = 8_000;
export const VERIFY_MAX_REDIRECTS = 5;

/** Statuses below 500 count as "responded", except these two. */
export const VERIFY_REJECTED_STATUSES = [404, 410] as const;

/** Characters of visible body text extracted per site. */
export const EXTRACT_BODY_TEXT_LIMIT = 1500;

// --- Section 7, step 4: screenshots --------------------------------------

export const SCREENSHOT_CONCURRENCY = 3;
export const SCREENSHOT_VIEWPORT = { width: 1440, height: 900 } as const;
export const SCREENSHOT_DEVICE_SCALE_FACTOR = 1;
export const SCREENSHOT_SETTLE_MS = 2000;
export const SCREENSHOT_TIMEOUT_MS = 20_000;
export const SCREENSHOT_JPEG_QUALITY = 70;

/** Best-effort cookie dismissal: text of the first visible matching button. */
export const CONSENT_BUTTON_TEXTS = [
  "accept",
  "agree",
  "allow all",
  "ok",
  "akkoord",
  "accepteren",
] as const;

// --- Section 7, step 5: analysis -----------------------------------------

/** Every score needs a reason, max 120 characters. */
export const SCORE_REASON_MAX_CHARS = 120;

/** Overlap score = round((sum of three 0-3 scores) / 9 * 100). */
export const OVERLAP_MAX = 9;
export const DIRECT_THRESHOLD = 2;
export const INDIRECT_MIN_PROBLEM_OVERLAP = 2;

export const MAX_DESIGN_PATTERNS = 6;

/** A design pattern must be shared by at least two screenshot-backed sites. */
export const MIN_PATTERN_DOMAINS = 2;
export const MIN_OPPORTUNITIES = 3;
export const MAX_OPPORTUNITIES = 5;

export const PRICING_MODELS = [
  "free",
  "freemium",
  "subscription",
  "one-time",
  "usage-based",
  "contact sales",
  "unknown",
] as const;

// --- Section 8: job handling ---------------------------------------------

export const POLL_INTERVAL_MS = 2000;
export const INTERRUPTED_MESSAGE = "Interrupted — please re-run.";

// --- Section 9: error messages -------------------------------------------

export const GEMINI_QUOTA_MESSAGE =
  "The free AI quota is used up for now — try again later";
export const BUSY_MESSAGE =
  "Another brief is already running. Wait for it to finish, then try again.";
export const NO_COMPETITORS_MESSAGE =
  "No clear competitors found. This can mean a genuinely new idea, or that the search missed them — try editing the profile's search queries.";
export const FOOTER_DISCLAIMER =
  "AI-assisted research from public web pages. Verify before making decisions.";

// --- Section 10: display caps --------------------------------------------

export const MAX_DIRECT_CARDS = 6;
export const MAX_INDIRECT_CARDS = 6;

// --- Availability retries -------------------------------------------------

/**
 * A 503 UNAVAILABLE from Gemini means "high demand", not quota exhaustion.
 * Section 9 forbids automatic retries for quota errors (429) only, so a
 * bounded retry on 503 is applied. Never retried more than this.
 */
export const MAX_AVAILABILITY_RETRIES = 3;
export const AVAILABILITY_RETRY_BASE_MS = 1500;

// --- Input field caps used by route validation ---------------------------

export const MAX_TEXTAREA_CHARS = 5000;
