import type { CandidateOutput } from "@/lib/ai/schema";
import { MAX_CANDIDATES_TO_VERIFY } from "@/lib/config/limits";
import { isDenylisted, normalizeDomain } from "@/lib/domain";

export interface PreparedCandidate {
  name: string;
  domain: string;
  evidenceUrl: string;
  reason: string;
  /** Position after filtering; preserves the model's relevance order. */
  relevanceIndex: number;
}

/**
 * Code-side rules applied after AI request 2 (spec section 7, step 2):
 *
 * 1. Drop any candidate whose evidenceUrl is not one of the provided results.
 * 2. Normalize domains to the registrable domain; dedupe keeping the first.
 * 3. Drop denylisted platforms.
 * 4. Cap at the verification limit.
 */
export function prepareCandidates(
  raw: CandidateOutput[],
  providedEvidenceUrls: Iterable<string>,
): PreparedCandidate[] {
  const allowed = new Set<string>();
  for (const url of providedEvidenceUrls) {
    const trimmed = url.trim();
    if (trimmed) allowed.add(trimmed);
  }

  const seenDomains = new Set<string>();
  const prepared: PreparedCandidate[] = [];

  for (const candidate of raw) {
    if (prepared.length >= MAX_CANDIDATES_TO_VERIFY) break;

    const evidenceUrl = candidate.evidenceUrl.trim();
    if (!allowed.has(evidenceUrl)) continue;

    const domain = normalizeDomain(candidate.domain);
    if (!domain) continue;

    if (isDenylisted(domain)) continue;

    if (seenDomains.has(domain)) continue;
    seenDomains.add(domain);

    prepared.push({
      name: candidate.name.trim() || domain,
      domain,
      evidenceUrl,
      reason: candidate.reason,
      relevanceIndex: prepared.length,
    });
  }

  return prepared;
}
