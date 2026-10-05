import { z } from "zod";
import { SCORE_REASON_MAX_CHARS } from "@/lib/config/limits";

/**
 * Every AI output shape, validated with zod.
 * These schemas double as the contract the Gemini JSON schema is written from.
 */

// --- Section 7, step 1: IdeaProfile ---------------------------------------

export const ideaProfileSchema = z
  .object({
    summary: z.string().min(1).max(200),
    problem: z.string().min(1),
    targetCustomer: z.string().min(1),
    solutionType: z.string().min(1),
    keyFeatures: z.array(z.string().min(1)).min(1).max(6),
    category: z.string().min(1),
    searchQueries: z.array(z.string().min(1)).min(1).max(8),
    clarity: z.enum(["clear", "vague"]),
    clarifyingQuestions: z.array(z.string().min(1)).max(3),
  })
  .superRefine((value, ctx) => {
    // "non-empty only when clarity is vague"
    if (value.clarity === "clear" && value.clarifyingQuestions.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["clarifyingQuestions"],
        message:
          "clarifyingQuestions must be empty when clarity is 'clear'.",
      });
    }
  });

export type IdeaProfile = z.infer<typeof ideaProfileSchema>;

// --- Section 7, step 2: candidates ---------------------------------------

export const candidateSchema = z.object({
  name: z.string().min(1),
  domain: z.string().min(1),
  evidenceUrl: z.string().min(1),
  reason: z.string().max(120),
});

export const candidatesOutputSchema = z.object({
  candidates: z.array(candidateSchema).max(20),
});

export type CandidateOutput = z.infer<typeof candidateSchema>;
export type CandidatesOutput = z.infer<typeof candidatesOutputSchema>;

// --- Section 7, step 5: analysis -----------------------------------------

const scoreFieldSchema = z.object({
  score: z.number().int().min(0).max(3),
  /** Max 120 characters (spec section 7, step 5). */
  reason: z.string().min(1).max(SCORE_REASON_MAX_CHARS),
});

export type ScoreField = z.infer<typeof scoreFieldSchema>;

export const analysisCompetitorSchema = z.object({
  domain: z.string().min(1),
  problemOverlap: scoreFieldSchema,
  customerOverlap: scoreFieldSchema,
  solutionSimilarity: scoreFieldSchema,
  positioning: z.string().min(1).max(140),
  pricingModel: z.enum([
    "free",
    "freemium",
    "subscription",
    "one-time",
    "usage-based",
    "contact sales",
    "unknown",
  ]),
  strengths: z.array(z.string().min(1)).max(3),
  gaps: z.array(z.string().min(1)).max(3),
});

export const designPatternSchema = z.object({
  pattern: z.string().min(1),
  domains: z.array(z.string().min(1)).min(1),
});

export const opportunitySchema = z.object({
  title: z.string().min(1).max(60),
  explanation: z.string().min(1),
});

export const analysisOutputSchema = z.object({
  landscapeSummary: z.string().min(1),
  competitors: z.array(analysisCompetitorSchema),
  designPatterns: z.array(designPatternSchema).max(6),
  opportunities: z.array(opportunitySchema).min(3).max(5),
});

export type AnalysisCompetitor = z.infer<typeof analysisCompetitorSchema>;
export type DesignPattern = z.infer<typeof designPatternSchema>;
export type Opportunity = z.infer<typeof opportunitySchema>;
export type AnalysisOutput = z.infer<typeof analysisOutputSchema>;

// --- Input form -----------------------------------------------------------

export const ideaInputSchema = z.object({
  idea: z.string().min(20).max(3000),
  targetCustomer: z.string().max(300).optional().or(z.literal("")),
  market: z.string().max(100).optional().or(z.literal("")),
});

export type IdeaInput = z.infer<typeof ideaInputSchema>;
