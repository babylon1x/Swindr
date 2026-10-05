import type { AnalysisCompetitor } from "@/lib/ai/schema";
import {
  DIRECT_THRESHOLD,
  INDIRECT_MIN_PROBLEM_OVERLAP,
  MIN_PATTERN_DOMAINS,
  OVERLAP_MAX,
} from "@/lib/config/limits";

export type Category = "direct" | "indirect";

export interface ClassificationInput {
  problemOverlap: number;
  customerOverlap: number;
  solutionSimilarity: number;
}

/**
 * DIRECT if all three scores are >= 2.
 * INDIRECT if not direct and problemOverlap >= 2.
 * Otherwise NOT RELEVANT (the caller drops it entirely).
 *
 * Computed in code, never by the AI (spec section 7, step 5).
 */
export function classify(input: ClassificationInput): Category | null {
  const { problemOverlap, customerOverlap, solutionSimilarity } = input;
  if (
    problemOverlap >= DIRECT_THRESHOLD &&
    customerOverlap >= DIRECT_THRESHOLD &&
    solutionSimilarity >= DIRECT_THRESHOLD
  ) {
    return "direct";
  }
  if (problemOverlap >= INDIRECT_MIN_PROBLEM_OVERLAP) {
    return "indirect";
  }
  return null;
}

/** Overlap score 0-100 = round((sum of the three 0-3 scores) / 9 * 100). */
export function overlapScore(input: ClassificationInput): number {
  const sum =
    input.problemOverlap + input.customerOverlap + input.solutionSimilarity;
  return Math.round((sum / OVERLAP_MAX) * 100);
}

export interface ScoredEntry {
  competitor: AnalysisCompetitor;
  category: Category;
  overlapScore: number;
  relevanceIndex: number;
}

/**
 * Classifies every analysis entry, drops unknown domains, and sorts each
 * category by overlap score descending with step-2 order breaking ties.
 */
export function classifyAll(
  entries: { competitor: AnalysisCompetitor; relevanceIndex: number }[],
  providedDomains: Set<string>,
): ScoredEntry[] {
  const scored: ScoredEntry[] = [];
  const seen = new Set<string>();

  for (const { competitor, relevanceIndex } of entries) {
    const domain = competitor.domain.trim().toLowerCase();
    if (!providedDomains.has(domain)) continue;
    if (seen.has(domain)) continue;
    seen.add(domain);

    const category = classify({
      problemOverlap: competitor.problemOverlap.score,
      customerOverlap: competitor.customerOverlap.score,
      solutionSimilarity: competitor.solutionSimilarity.score,
    });
    if (!category) continue;

    scored.push({
      competitor,
      category,
      overlapScore: overlapScore({
        problemOverlap: competitor.problemOverlap.score,
        customerOverlap: competitor.customerOverlap.score,
        solutionSimilarity: competitor.solutionSimilarity.score,
      }),
      relevanceIndex,
    });
  }

  return scored.sort(
    (a, b) =>
      b.overlapScore - a.overlapScore || a.relevanceIndex - b.relevanceIndex,
  );
}

/**
 * A design pattern is only reported when it is genuinely SHARED, so its
 * `domains` must contain at least two screenshot-backed competitors
 * (spec section 7, step 5). Pattern domains that were not provided or had no
 * screenshot are dropped, and patterns that fall below the minimum are removed.
 */
export function sanitizeDesignPatterns(
  patterns: { pattern: string; domains: string[] }[],
  screenshotDomains: Set<string>,
): { pattern: string; domains: string[] }[] {
  const result: { pattern: string; domains: string[] }[] = [];

  for (const entry of patterns) {
    const pattern = entry.pattern.trim();
    if (!pattern) continue;

    const domains = [
      ...new Set(
        entry.domains
          .map((domain) => domain.trim().toLowerCase())
          .filter((domain) => domain && screenshotDomains.has(domain)),
      ),
    ];

    if (domains.length < MIN_PATTERN_DOMAINS) continue;

    result.push({ pattern, domains });
  }

  return result;
}
