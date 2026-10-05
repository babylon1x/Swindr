import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import type { IdeaProfile } from "@/lib/ai/schema";
import type {
  AnalysisCompetitor,
  Opportunity,
} from "@/lib/ai/schema";
import {
  BRIEFS_DIR,
  briefFile,
  briefImagesDir,
  ensureDataDirs,
  isSafeId,
  withWriteLock,
} from "./paths";
import { INTERRUPTED_MESSAGE } from "@/lib/config/limits";

/**
 * `draft` is a local-only state for a profile that has been generated but not
 * yet run, so the profile editor has something to render. It is never
 * produced by the pipeline and survives a restart as editable.
 */
export type BriefStatus = "draft" | "running" | "done" | "failed";

export type BriefStage =
  | "draft"
  | "searching"
  | "extracting"
  | "verifying"
  | "screenshotting"
  | "analyzing"
  | "done";

export interface ExtractedPage {
  title?: string;
  metaDescription?: string;
  heading?: string;
  bodyText?: string;
}

export interface VerifiedCompetitor {
  domain: string;
  name: string;
  evidenceUrl: string;
  reason: string;
  finalUrl: string;
  httpStatus: number;
  limitedData: boolean;
  extracted?: ExtractedPage;
  /** Basename inside data/images/<briefId>/. Absent when the screenshot failed. */
  screenshotFile?: string;
  /** Position in step 2's relevance order; used to break score ties. */
  relevanceIndex: number;
}

export type Classification = "direct" | "indirect";

export interface ScoredCompetitor extends AnalysisCompetitor {
  name: string;
  evidenceUrl: string;
  classification: Classification;
  overlapScore: number;
  limitedData: boolean;
  screenshotFile?: string;
  relevanceIndex: number;
}

export interface BriefResult {
  landscapeSummary: string;
  direct: ScoredCompetitor[];
  indirect: ScoredCompetitor[];
  designPatterns: { pattern: string; domains: string[] }[];
  opportunities: Opportunity[];
  zeroCompetitors: boolean;
}

export interface BriefStats {
  tavilySearches: number;
  tavilyCachedQueries: number;
  aiRequests: number;
}

export interface Brief {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: BriefStatus;
  stage: BriefStage;
  error?: string;
  input: {
    idea: string;
    targetCustomer?: string;
    market?: string;
  };
  profile?: IdeaProfile;
  verified?: VerifiedCompetitor[];
  result?: BriefResult;
  stats: BriefStats;
}

export function newBriefId(): string {
  return randomUUID();
}

export async function createBrief(input: Brief["input"]): Promise<Brief> {
  await ensureDataDirs();
  const now = new Date().toISOString();
  const brief: Brief = {
    id: newBriefId(),
    createdAt: now,
    updatedAt: now,
    status: "draft",
    stage: "draft",
    input,
    stats: { tavilySearches: 0, tavilyCachedQueries: 0, aiRequests: 0 },
  };
  await saveBrief(brief);
  return brief;
}

/** Creates a brief from a saved profile (used by "Edit profile & re-run"). */
export async function createBriefFromProfile(
  source: Brief,
): Promise<Brief> {
  await ensureDataDirs();
  const now = new Date().toISOString();
  const brief: Brief = {
    ...source,
    id: newBriefId(),
    createdAt: now,
    updatedAt: now,
    status: "draft",
    stage: "draft",
    error: undefined,
    verified: undefined,
    result: undefined,
    stats: { tavilySearches: 0, tavilyCachedQueries: 0, aiRequests: 0 },
  };
  await saveBrief(brief);
  return brief;
}

export async function saveBrief(brief: Brief): Promise<void> {
  await ensureDataDirs();
  const file = briefFile(brief.id);
  await withWriteLock(file, async () => {
    brief.updatedAt = new Date().toISOString();
    await fs.writeFile(file, JSON.stringify(brief, null, 2), "utf8");
  });
}

export async function getBrief(id: string): Promise<Brief | null> {
  if (!isSafeId(id)) return null;
  try {
    const raw = await fs.readFile(briefFile(id), "utf8");
    return JSON.parse(raw) as Brief;
  } catch {
    return null;
  }
}

export async function updateBrief(
  id: string,
  patch: Partial<Brief>,
): Promise<Brief | null> {
  const existing = await getBrief(id);
  if (!existing) return null;
  const next: Brief = { ...existing, ...patch };
  await saveBrief(next);
  return next;
}

export async function listBriefs(): Promise<Brief[]> {
  await ensureDataDirs();
  let names: string[];
  try {
    names = await fs.readdir(BRIEFS_DIR);
  } catch {
    return [];
  }
  const briefs: Brief[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(BRIEFS_DIR, name), "utf8");
      briefs.push(JSON.parse(raw) as Brief);
    } catch {
      // Skip unreadable files rather than failing the whole history page.
    }
  }
  return briefs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Removes the brief JSON and its screenshot folder. */
export async function deleteBrief(id: string): Promise<boolean> {
  if (!isSafeId(id)) return false;
  let removed = false;
  try {
    await fs.unlink(briefFile(id));
    removed = true;
  } catch {
    // File may already be gone.
  }
  try {
    await fs.rm(briefImagesDir(id), { recursive: true, force: true });
    removed = true;
  } catch {
    // Image folder may not exist.
  }
  return removed;
}

export async function markAllRunningAsInterrupted(): Promise<number> {
  const briefs = await listBriefs();
  let count = 0;
  for (const brief of briefs) {
    if (brief.status === "running") {
      await updateBrief(brief.id, {
        status: "failed",
        error: INTERRUPTED_MESSAGE,
      });
      count += 1;
    }
  }
  return count;
}
