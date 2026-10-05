/**
 * JSON schemas handed to Gemini's structured-output feature.
 *
 * These are written by hand (rather than derived from zod) because Gemini
 * accepts only a subset of JSON Schema: type is uppercase, and enum/
 * minItems/maxItems are supported but description/minimum are not relied upon.
 * zod remains the authority for validation (see ./schema.ts).
 */

type GeminiSchema = Record<string, unknown>;

const str = (description: string): GeminiSchema => ({
  type: "STRING",
  description,
});

const strArray = (
  description: string,
  minItems: number,
  maxItems: number,
): GeminiSchema => ({
  type: "ARRAY",
  description,
  minItems,
  maxItems,
  items: { type: "STRING" },
});

/** IdeaProfile — AI request 1. */
export const ideaProfileJsonSchema: GeminiSchema = {
  type: "OBJECT",
  properties: {
    summary: str("One-sentence summary of the idea, max 200 characters."),
    problem: str("The core problem this idea solves."),
    targetCustomer: str("Who specifically has this problem."),
    solutionType: str(
      'The kind of solution, e.g. "mobile app", "B2B SaaS", "marketplace", "physical product", "service".',
    ),
    keyFeatures: strArray("Key features, 1 to 6 items.", 1, 6),
    category: str("The industry or category, in a few words."),
    searchQueries: strArray(
      "Search queries written to find real companies solving this problem, 4 to 8 items.",
      4,
      8,
    ),
    clarity: {
      type: "STRING",
      description: 'Either "clear" or "vague".',
      enum: ["clear", "vague"],
    },
    clarifyingQuestions: strArray(
      'Questions the founder should answer. MUST be an empty array when clarity is "clear".',
      0,
      3,
    ),
  },
  required: [
    "summary",
    "problem",
    "targetCustomer",
    "solutionType",
    "keyFeatures",
    "category",
    "searchQueries",
    "clarity",
    "clarifyingQuestions",
  ],
  propertyOrdering: [
    "summary",
    "problem",
    "targetCustomer",
    "solutionType",
    "keyFeatures",
    "category",
    "searchQueries",
    "clarity",
    "clarifyingQuestions",
  ],
};

/** Candidate extraction — AI request 2. */
export const candidatesJsonSchema: GeminiSchema = {
  type: "OBJECT",
  properties: {
    candidates: {
      type: "ARRAY",
      description:
        "Real companies found in the search results, most relevant first, at most 20.",
      items: {
        type: "OBJECT",
        properties: {
          name: str("The company's own name."),
          domain: str(
            "The company's own website domain, e.g. example.com. Not an article or directory domain.",
          ),
          evidenceUrl: str(
            "One of the exact result URLs provided in the input. Copy it verbatim.",
          ),
          reason: str("Why this is a competitor. Max 120 characters."),
        },
        required: ["name", "domain", "evidenceUrl", "reason"],
        propertyOrdering: ["name", "domain", "evidenceUrl", "reason"],
      },
    },
  },
  required: ["candidates"],
  propertyOrdering: ["candidates"],
};

/**
 * Scores are constrained with minimum/maximum, never an integer `enum`.
 * Gemini's REST endpoint rejects numeric enum members (it expects strings
 * there) and answers HTTP 400, so a 0-3 enum would make every analysis call
 * fail. zod remains the authority for the 0-3 range.
 */
const scoreField = (label: string): GeminiSchema => ({
  type: "OBJECT",
  properties: {
    score: {
      type: "INTEGER",
      description: `${label} score from 0 to 3, where 3 is a very strong overlap.`,
      minimum: 0,
      maximum: 3,
    },
    reason: str(`Why this ${label} score. Max 120 characters.`),
  },
  required: ["score", "reason"],
  propertyOrdering: ["score", "reason"],
});

/** Landscape analysis — AI request 3. */
export const analysisJsonSchema: GeminiSchema = {
  type: "OBJECT",
  properties: {
    landscapeSummary: str(
      "Two to three sentences summarising the competitive landscape.",
    ),
    competitors: {
      type: "ARRAY",
      description:
        "Exactly one entry per domain provided in the input, no more and no fewer.",
      items: {
        type: "OBJECT",
        properties: {
          domain: str(
            "Must exactly match one of the domains provided in the input.",
          ),
          problemOverlap: scoreField("problemOverlap"),
          customerOverlap: scoreField("customerOverlap"),
          solutionSimilarity: scoreField("solutionSimilarity"),
          positioning: str(
            "Their one-line pitch in your own words. Max 140 characters.",
          ),
          pricingModel: {
            type: "STRING",
            description:
              'Use "unknown" unless pricing is actually visible in the provided text or screenshot.',
            enum: [
              "free",
              "freemium",
              "subscription",
              "one-time",
              "usage-based",
              "contact sales",
              "unknown",
            ],
          },
          strengths: strArray("Up to 3 strengths.", 0, 3),
          gaps: strArray(
            "Up to 3 weaknesses, or things they do not do that this idea could.",
            0,
            3,
          ),
        },
        required: [
          "domain",
          "problemOverlap",
          "customerOverlap",
          "solutionSimilarity",
          "positioning",
          "pricingModel",
          "strengths",
          "gaps",
        ],
        propertyOrdering: [
          "domain",
          "problemOverlap",
          "customerOverlap",
          "solutionSimilarity",
          "positioning",
          "pricingModel",
          "strengths",
          "gaps",
        ],
      },
    },
    designPatterns: {
      type: "ARRAY",
      description:
        "Visual or messaging conventions shared by at least 2 competitors that have screenshots. Empty array if fewer than 2 screenshots were provided.",
      maxItems: 6,
      items: {
        type: "OBJECT",
        properties: {
          pattern: str(
            "A visual or messaging convention, e.g. hero layout, color mood, CTA wording, type of social proof.",
          ),
          domains: {
            type: "ARRAY",
            description: "Domains whose screenshot shows this pattern.",
            items: { type: "STRING" },
          },
        },
        required: ["pattern", "domains"],
        propertyOrdering: ["pattern", "domains"],
      },
    },
    opportunities: {
      type: "ARRAY",
      description: "3 to 5 opportunities to stand out.",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "OBJECT",
        properties: {
          title: str("Short title. Max 60 characters."),
          explanation: str("Why this is an opportunity to stand out."),
        },
        required: ["title", "explanation"],
        propertyOrdering: ["title", "explanation"],
      },
    },
  },
  required: [
    "landscapeSummary",
    "competitors",
    "designPatterns",
    "opportunities",
  ],
  propertyOrdering: [
    "landscapeSummary",
    "competitors",
    "designPatterns",
    "opportunities",
  ],
};
