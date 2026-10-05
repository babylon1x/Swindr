import { describe, expect, it } from "vitest";
import {
  analysisOutputSchema,
  candidateSchema,
  candidatesOutputSchema,
  ideaInputSchema,
  ideaProfileSchema,
} from "@/lib/ai/schema";

/** A minimal valid analysis payload; individual tests break one field at a time. */
function validAnalysis() {
  return {
    landscapeSummary: "Two tools dominate this space.",
    competitors: [
      {
        domain: "alpha.com",
        problemOverlap: { score: 3, reason: "Same core problem." },
        customerOverlap: { score: 3, reason: "Same customer." },
        solutionSimilarity: { score: 2, reason: "Similar form." },
        positioning: "Client feedback for designers.",
        pricingModel: "freemium",
        strengths: ["Fast setup"],
        gaps: ["No mobile app"],
      },
    ],
    designPatterns: [
      { pattern: "Hero CTA", domains: ["alpha.com", "beta.com"] },
    ],
    opportunities: [
      { title: "Offline mode", explanation: "Nobody supports it." },
      { title: "Better pricing", explanation: "Everyone is expensive." },
      { title: "Faster onboarding", explanation: "Setup takes days." },
    ],
  };
}

describe("ideaProfileSchema", () => {
  const valid = {
    summary: "Client feedback for freelance designers",
    problem: "Feedback on portfolio work is scattered across email.",
    targetCustomer: "Freelance designers",
    solutionType: "web app",
    keyFeatures: ["Structured feedback", "Version history"],
    category: "Design feedback",
    searchQueries: ["design feedback app", "portfolio review tool"],
    clarity: "clear",
    clarifyingQuestions: [],
  };

  it("accepts a valid clear profile", () => {
    expect(ideaProfileSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a vague profile with clarifying questions", () => {
    const result = ideaProfileSchema.safeParse({
      ...valid,
      clarity: "vague",
      clarifyingQuestions: ["Who is the target customer?"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects clarifying questions on a clear profile", () => {
    const result = ideaProfileSchema.safeParse({
      ...valid,
      clarifyingQuestions: ["What market?"],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["clarifyingQuestions"]);
    }
  });

  it("rejects an unknown clarity value", () => {
    expect(ideaProfileSchema.safeParse({ ...valid, clarity: "medium" }).success).toBe(false);
  });

  it("rejects more than 8 search queries", () => {
    const queries = Array.from({ length: 9 }, (_, i) => `query ${i}`);
    expect(ideaProfileSchema.safeParse({ ...valid, searchQueries: queries }).success).toBe(false);
  });

  it("rejects more than 6 key features", () => {
    const features = Array.from({ length: 7 }, (_, i) => `feature ${i}`);
    expect(ideaProfileSchema.safeParse({ ...valid, keyFeatures: features }).success).toBe(false);
  });

  it("rejects an empty summary and an over-long summary", () => {
    expect(ideaProfileSchema.safeParse({ ...valid, summary: "" }).success).toBe(false);
    expect(
      ideaProfileSchema.safeParse({ ...valid, summary: "x".repeat(201) }).success,
    ).toBe(false);
  });

  it("rejects more than 3 clarifying questions", () => {
    const questions = ["a?", "b?", "c?", "d?"];
    const result = ideaProfileSchema.safeParse({
      ...valid,
      clarity: "vague",
      clarifyingQuestions: questions,
    });
    expect(result.success).toBe(false);
  });
});

describe("candidateSchema", () => {
  it("accepts a valid candidate", () => {
    expect(
      candidateSchema.safeParse({
        name: "Acme",
        domain: "acme.com",
        evidenceUrl: "https://acme.com/",
        reason: "same problem",
      }).success,
    ).toBe(true);
  });

  it("rejects an over-long reason", () => {
    expect(
      candidateSchema.safeParse({
        name: "Acme",
        domain: "acme.com",
        evidenceUrl: "https://acme.com/",
        reason: "x".repeat(121),
      }).success,
    ).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(candidateSchema.safeParse({ name: "Acme" }).success).toBe(false);
  });
});

describe("candidatesOutputSchema", () => {
  it("accepts an empty list (the brief then reports no competitors)", () => {
    expect(candidatesOutputSchema.safeParse({ candidates: [] }).success).toBe(true);
  });

  it("rejects more than 20 candidates", () => {
    const candidates = Array.from({ length: 21 }, (_, i) => ({
      name: `C${i}`,
      domain: `c${i}.com`,
      evidenceUrl: `https://c${i}.com/`,
      reason: "r",
    }));
    expect(candidatesOutputSchema.safeParse({ candidates }).success).toBe(false);
  });
});

describe("analysisOutputSchema", () => {
  it("accepts a valid analysis", () => {
    expect(analysisOutputSchema.safeParse(validAnalysis()).success).toBe(true);
  });

  it("accepts an empty competitors array", () => {
    const result = analysisOutputSchema.safeParse({
      ...validAnalysis(),
      competitors: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects scores outside 0-3", () => {
    for (const score of [-1, 4, 2.5]) {
      const broken = validAnalysis();
      broken.competitors[0].problemOverlap.score = score;
      expect(analysisOutputSchema.safeParse(broken).success).toBe(false);
    }
  });

  it("rejects an unknown pricingModel", () => {
    const broken = validAnalysis();
    broken.competitors[0].pricingModel = "per-seat";
    expect(analysisOutputSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects positioning longer than 140 characters", () => {
    const broken = validAnalysis();
    broken.competitors[0].positioning = "x".repeat(141);
    expect(analysisOutputSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects an over-long score reason", () => {
    const broken = validAnalysis();
    broken.competitors[0].problemOverlap.reason = "x".repeat(121);
    expect(analysisOutputSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects more than 3 strengths or gaps", () => {
    const broken = validAnalysis();
    broken.competitors[0].strengths = ["a", "b", "c", "d"];
    expect(analysisOutputSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects fewer than 3 opportunities", () => {
    const broken = validAnalysis();
    broken.opportunities = [broken.opportunities[0]];
    expect(analysisOutputSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects more than 5 opportunities", () => {
    const broken = validAnalysis();
    broken.opportunities = Array.from({ length: 6 }, (_, i) => ({
      title: `T${i}`,
      explanation: "e",
    }));
    expect(analysisOutputSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects more than 6 design patterns", () => {
    const broken = validAnalysis();
    broken.designPatterns = Array.from({ length: 7 }, (_, i) => ({
      pattern: `P${i}`,
      domains: ["alpha.com", "beta.com"],
    }));
    expect(analysisOutputSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects a pattern with no domains", () => {
    const broken = validAnalysis();
    broken.designPatterns = [{ pattern: "Hero", domains: [] }];
    expect(analysisOutputSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects an opportunity title longer than 60 characters", () => {
    const broken = validAnalysis();
    broken.opportunities[0].title = "x".repeat(61);
    expect(analysisOutputSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects an empty landscape summary", () => {
    const broken = validAnalysis();
    broken.landscapeSummary = "";
    expect(analysisOutputSchema.safeParse(broken).success).toBe(false);
  });
});

describe("ideaInputSchema", () => {
  it("accepts an idea at the minimum length", () => {
    expect(ideaInputSchema.safeParse({ idea: "x".repeat(20) }).success).toBe(true);
  });

  it("rejects an idea below the minimum length", () => {
    expect(ideaInputSchema.safeParse({ idea: "x".repeat(19) }).success).toBe(false);
  });

  it("rejects an idea above the maximum length", () => {
    expect(ideaInputSchema.safeParse({ idea: "x".repeat(3001) }).success).toBe(false);
  });

  it("accepts empty optional fields", () => {
    expect(
      ideaInputSchema.safeParse({ idea: "x".repeat(30), targetCustomer: "", market: "" })
        .success,
    ).toBe(true);
  });

  it("rejects over-long optional fields", () => {
    expect(
      ideaInputSchema.safeParse({ idea: "x".repeat(30), targetCustomer: "y".repeat(301) })
        .success,
    ).toBe(false);
    expect(
      ideaInputSchema.safeParse({ idea: "x".repeat(30), market: "m".repeat(101) }).success,
    ).toBe(false);
  });
});