import fs from "fs/promises";
import { USAGE_FILE, ensureDataDirs, withWriteLock } from "./paths";

/**
 * Local usage meter (spec section 9). Counted by this app, not read from any
 * provider dashboard, so it is labelled "local estimate" in the UI.
 *
 * Tavily searches are counted per calendar month; Gemini requests per day.
 */

interface UsageShape {
  /** YYYY-MM -> Tavily searches actually billed (cache misses only). */
  months: Record<string, { tavilySearches: number }>;
  /** YYYY-MM-DD -> Gemini generateContent calls made. */
  days: Record<string, { geminiRequests: number }>;
}

const EMPTY: UsageShape = { months: {}, days: {} };

function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dayKey(date = new Date()): string {
  return monthKey(date) + "-" + String(date.getDate()).padStart(2, "0");
}

/** Keeps the file from growing without bound. */
function prune(usage: UsageShape): UsageShape {
  const months = Object.keys(usage.months).sort().slice(-3);
  const days = Object.keys(usage.days).sort().slice(-90);
  return {
    months: Object.fromEntries(months.map((k) => [k, usage.months[k]])),
    days: Object.fromEntries(days.map((k) => [k, usage.days[k]])),
  };
}

export async function readUsage(): Promise<UsageShape> {
  try {
    const raw = await fs.readFile(USAGE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<UsageShape>;
    return {
      months: parsed.months ?? {},
      days: parsed.days ?? {},
    };
  } catch {
    return { months: {}, days: {} };
  }
}

async function mutate(
  key: string,
  fn: (usage: UsageShape) => void,
): Promise<void> {
  await ensureDataDirs();
  await withWriteLock(key, async () => {
    const usage = await readUsage();
    fn(usage);
    const pruned = prune(usage);
    await fs.writeFile(USAGE_FILE, JSON.stringify(pruned, null, 2), "utf8");
  });
}

/** Counts one Tavily search that consumed a credit (cache misses only). */
export async function recordTavilySearch(count = 1): Promise<void> {
  const key = monthKey();
  await mutate("usage", (usage) => {
    const entry = usage.months[key] ?? { tavilySearches: 0 };
    entry.tavilySearches += count;
    usage.months[key] = entry;
  });
}

/** Counts one Gemini generateContent call, including validation retries. */
export async function recordGeminiRequest(count = 1): Promise<void> {
  const key = dayKey();
  await mutate("usage", (usage) => {
    const entry = usage.days[key] ?? { geminiRequests: 0 };
    entry.geminiRequests += count;
    usage.days[key] = entry;
  });
}

export interface UsageSummary {
  month: string;
  day: string;
  tavilySearchesThisMonth: number;
  geminiRequestsToday: number;
}

export async function getUsageSummary(): Promise<UsageSummary> {
  const usage = await readUsage();
  return {
    month: monthKey(),
    day: dayKey(),
    tavilySearchesThisMonth: usage.months[monthKey()]?.tavilySearches ?? 0,
    geminiRequestsToday: usage.days[dayKey()]?.geminiRequests ?? 0,
  };
}
