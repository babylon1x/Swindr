import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { TAVILY_CACHE_DIR, ensureDir } from "@/lib/storage/paths";
import { TAVILY_CACHE_TTL_DAYS } from "@/lib/config/limits";

/**
 * Tavily response cache keyed by the exact query string (spec section 7,
 * step 2). Cached queries consume no credits and do not count against the
 * per-brief search limit, so this is deliberately generous (7 days).
 */

export interface CachedResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface CacheEntry {
  query: string;
  savedAt: string;
  results: CachedResult[];
}

function cachePath(query: string): string {
  const hash = crypto.createHash("sha256").update(query).digest("hex");
  return path.join(TAVILY_CACHE_DIR, `${hash}.json`);
}

export async function readCache(
  query: string,
  now = new Date(),
): Promise<CachedResult[] | null> {
  try {
    const raw = await fs.readFile(cachePath(query), "utf8");
    const entry = JSON.parse(raw) as CacheEntry;
    if (!Array.isArray(entry.results)) return null;

    const savedAt = new Date(entry.savedAt).getTime();
    if (!Number.isFinite(savedAt)) return null;

    const ageMs = now.getTime() - savedAt;
    const ttlMs = TAVILY_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
    if (ageMs > ttlMs) return null;

    return entry.results;
  } catch {
    return null;
  }
}

export async function writeCache(
  query: string,
  results: CachedResult[],
  now = new Date(),
): Promise<void> {
  try {
    await ensureDir(TAVILY_CACHE_DIR);
    const entry: CacheEntry = {
      query,
      savedAt: now.toISOString(),
      results,
    };
    await fs.writeFile(cachePath(query), JSON.stringify(entry, null, 2), "utf8");
  } catch {
    // A cache write failure must never fail a brief.
  }
}
