import { describe, expect, it } from "vitest";
import {
  classify,
  classifyAll,
  overlapScore,
  sanitizeDesignPatterns,
} from "@/lib/pipeline/classify";
import {
  DIRECT_THRESHOLD,
  INDIRECT_MIN_PROBLEM_OVERLAP,
  MIN_PATTERN_DOMAINS,
} from "@/lib/config/limits";
import type { AnalysisCompetitor } from "@/lib/ai/schema";

/** Spec section 7, step 5: classification rules. */
describe("classify", () => {
  it("is DIRECT only when all three scores are >= 2", () => {
    expect(classify({ problemOverlap: 2, customerOverlap: 2, solutionSimilarity: 2 })).toBe(
      "direct",
    );
    expect(classify({ problemOverlap: 3, customerOverlap: 3, solutionSimilarity: 3 })).toBe(
      "direct",
    );
    expect(classify({ problemOverlap: 2, customerOverlap: 3, solutionSimilarity: 3 })).toBe(
      "direct",
    );
  });

  it("is not DIRECT when any one score drops below the threshold", () => {
    // Boundary: 2 vs 1 on each dimension in turn. A 1 on problemOverlap drops
    // the entry below INDIRECT too, so it becomes NOT RELEVANT.
    expect(
      classify({ problemOverlap: 2, customerOverlap: 1, solutionSimilarity: 2 }),
    ).toBe("indirect");
    expect(
      classify({ problemOverlap: 2, customerOverlap: 2, solutionSimilarity: 1 }),
    ).toBe("indirect");
    expect(
      classify({ problemOverlap: 1, customerOverlap: 2, solutionSimilarity: 2 }),
    ).toBeNull();
    expect(
      classify({ problemOverlap: 2, customerOverlap: 1, solutionSimilarity: 1 }),
    ).toBe("indirect");
  });

  it("honours the configured thresholds", () => {
    expect(DIRECT_THRESHOLD).toBe(2);
    expect(INDIRECT_MIN_PROBLEM_OVERLAP).toBe(2);
  });

  it("is INDIRECT when not direct and problemOverlap >= 2", () => {
    expect(
      classify({ problemOverlap: 2, customerOverlap: 0, solutionSimilarity: 0 }),
    ).toBe("indirect");
    expect(
      classify({ problemOverlap: 3, customerOverlap: 1, solutionSimilarity: 1 }),
    ).toBe("indirect");
  });

  it("is NOT RELEVANT when problemOverlap < 2, whatever the other scores", () => {
    expect(classify({ problemOverlap: 1, customerOverlap: 3, solutionSimilarity: 3 })).toBeNull();
    expect(classify({ problemOverlap: 0, customerOverlap: 3, solutionSimilarity: 3 })).toBeNull();
    expect(classify({ problemOverlap: 0, customerOverlap: 0, solutionSimilarity: 0 })).toBeNull();
  });

  it("places a company in exactly one category", () => {
    const category = classify({ problemOverlap: 3, customerOverlap: 3, solutionSimilarity: 3 });
    expect(category).toBe("direct");
    expect(category).not.toBe("indirect");
  });
});

/** Overlap score = round((sum / 9) x 100). */
describe("overlapScore", () => {
  it("returns 0 for all-zero scores", () => {
    expect(overlapScore({ problemOverlap: 0, customerOverlap: 0, solutionSimilarity: 0 })).toBe(0);
  });

  it("returns 100 for all-maximum scores", () => {
    expect(overlapScore({ problemOverlap: 3, customerOverlap: 3, solutionSimilarity: 3 })).toBe(100);
  });

  it("matches round(sum / 9 * 100) at every sum from 0 to 9", () => {
    // Every achievable sum with three 0-3 values.
    for (let sum = 0; sum <= 9; sum += 1) {
      const scores: [number, number, number] =
        sum === 0 ? [0, 0, 0]
        : sum <= 3 ? [sum, 0, 0]
        : sum <= 6 ? [3, sum - 3, 0]
        : [3, 3, sum - 6];

      const expected = Math.round(((scores[0] + scores[1] + scores[2]) / 9) * 100);
      expect(overlapScore({
        problemOverlap: scores[0],
        customerOverlap: scores[1],
        solutionSimilarity: scores[2],
      })).toBe(expected);
    }
  });

  it("rounds the documented examples", () => {
    // 5/9 = 55.55... -> 56
    expect(overlapScore({ problemOverlap: 3, customerOverlap: 2, solutionSimilarity: 0 })).toBe(56);
    // 1/9 = 11.11... -> 11
    expect(overlapScore({ problemOverlap: 1, customerOverlap: 0, solutionSimilarity: 0 })).toBe(11);
    // 4/9 = 44.44... -> 44
    expect(overlapScore({ problemOverlap: 2, customerOverlap: 2, solutionSimilarity: 0 })).toBe(44);
  });

  it("stays within 0-100", () => {
    for (let a = 0; a <= 3; a += 1) {
      for (let b = 0; b <= 3; b += 1) {
        for (let c = 0; c <= 3; c += 1) {
          const score = overlapScore({
            problemOverlap: a,
            customerOverlap: b,
            solutionSimilarity: c,
          });
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);
        }
      }
    }
  });
});

function competitor(
  domain: string,
  scores: [number, number, number],
): AnalysisCompetitor {
  const reason = "test";
  return {
    domain,
    problemOverlap: { score: scores[0], reason },
    customerOverlap: { score: scores[1], reason },
    solutionSimilarity: { score: scores[2], reason },
    positioning: "pitch",
    pricingModel: "unknown",
    strengths: [],
    gaps: [],
  };
}

describe("classifyAll", () => {
  const provided = new Set(["alpha.com", "beta.com", "gamma.com", "ghost.com"]);

  it("drops entries whose domain was not provided", () => {
    const scored = classifyAll(
      [
        { competitor: competitor("alpha.com", [3, 3, 3]), relevanceIndex: 0 },
        { competitor: competitor("not-provided.com", [3, 3, 3]), relevanceIndex: 1 },
      ],
      provided,
    );
    expect(scored.map((entry) => entry.competitor.domain)).toEqual(["alpha.com"]);
  });

  it("drops NOT RELEVANT entries entirely", () => {
    const scored = classifyAll(
      [
        { competitor: competitor("alpha.com", [3, 3, 3]), relevanceIndex: 0 },
        { competitor: competitor("beta.com", [1, 3, 3]), relevanceIndex: 1 },
      ],
      provided,
    );
    expect(scored.map((entry) => entry.competitor.domain)).toEqual(["alpha.com"]);
  });

  it("dedupes repeated domains", () => {
    const scored = classifyAll(
      [
        { competitor: competitor("alpha.com", [3, 3, 3]), relevanceIndex: 0 },
        { competitor: competitor("alpha.com", [2, 2, 2]), relevanceIndex: 1 },
      ],
      provided,
    );
    expect(scored).toHaveLength(1);
    expect(scored[0].overlapScore).toBe(100);
  });

  it("sorts by overlap score descending", () => {
    const scored = classifyAll(
      [
        { competitor: competitor("alpha.com", [2, 2, 2]), relevanceIndex: 0 },
        { competitor: competitor("beta.com", [3, 3, 3]), relevanceIndex: 1 },
      ],
      provided,
    );
    expect(scored.map((entry) => entry.competitor.domain)).toEqual([
      "beta.com",
      "alpha.com",
    ]);
  });

  it("breaks score ties by step-2 relevance order", () => {
    const scored = classifyAll(
      [
        { competitor: competitor("gamma.com", [2, 2, 2]), relevanceIndex: 5 },
        { competitor: competitor("alpha.com", [2, 2, 2]), relevanceIndex: 1 },
      ],
      provided,
    );
    expect(scored.map((entry) => entry.competitor.domain)).toEqual([
      "alpha.com",
      "gamma.com",
    ]);
  });
});

/** Section 7, step 5: only patterns shared by >= 2 screenshot-backed sites. */
describe("sanitizeDesignPatterns", () => {
  const shots = new Set(["alpha.com", "beta.com", "gamma.com"]);

  it("keeps a pattern shared by two or more screenshot-backed domains", () => {
    const result = sanitizeDesignPatterns(
      [{ pattern: "Hero CTA above the fold", domains: ["alpha.com", "beta.com"] }],
      shots,
    );
    expect(result).toEqual([
      { pattern: "Hero CTA above the fold", domains: ["alpha.com", "beta.com"] },
    ]);
  });

  it("drops a pattern seen on only one competitor", () => {
    expect(
      sanitizeDesignPatterns(
        [{ pattern: "Solo convention", domains: ["alpha.com"] }],
        shots,
      ),
    ).toEqual([]);
    expect(MIN_PATTERN_DOMAINS).toBe(2);
  });

  it("drops pattern domains with no screenshot and re-checks the minimum", () => {
    // gamma.com has no screenshot, so only one domain survives -> dropped.
    expect(
      sanitizeDesignPatterns(
        [{ pattern: "Mixed", domains: ["alpha.com", "gamma.com"] }],
        new Set(["alpha.com", "beta.com"]),
      ),
    ).toEqual([]);

    // Two survive -> kept, with gamma removed.
    expect(
      sanitizeDesignPatterns(
        [{ pattern: "Mixed", domains: ["alpha.com", "beta.com", "gamma.com"] }],
        new Set(["alpha.com", "beta.com"]),
      ),
    ).toEqual([{ pattern: "Mixed", domains: ["alpha.com", "beta.com"] }]);
  });

  it("drops domains that were never provided", () => {
    expect(
      sanitizeDesignPatterns(
        [{ pattern: "Invented", domains: ["alpha.com", "made-up.com"] }],
        shots,
      ),
    ).toEqual([]);
  });

  it("normalizes case and trims, and dedupes repeated domains", () => {
    const result = sanitizeDesignPatterns(
      [{ pattern: "  Spaced  ", domains: [" Alpha.com ", "alpha.com", "BETA.com"] }],
      shots,
    );
    expect(result).toEqual([{ pattern: "Spaced", domains: ["alpha.com", "beta.com"] }]);
  });

  it("drops entries with an empty pattern", () => {
    expect(
      sanitizeDesignPatterns(
        [{ pattern: "   ", domains: ["alpha.com", "beta.com"] }],
        shots,
      ),
    ).toEqual([]);
  });
});