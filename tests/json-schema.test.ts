import { describe, expect, it } from "vitest";
import {
  analysisJsonSchema,
  candidatesJsonSchema,
  ideaProfileJsonSchema,
} from "@/lib/ai/json-schema";
import { summariseProviderError } from "@/lib/ai/client";

type Node = Record<string, unknown>;

function walk(node: unknown, visit: (value: Node) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  if (node && typeof node === "object") {
    visit(node as Node);
    for (const value of Object.values(node as Node)) walk(value, visit);
  }
}

const allSchemas = [
  ["ideaProfile", ideaProfileJsonSchema],
  ["candidates", candidatesJsonSchema],
  ["analysis", analysisJsonSchema],
] as const;

describe("Gemini structured-output schemas", () => {
  it.each(allSchemas)("%s declares every property as required", (name, schema) => {
    const properties = (schema as Node).properties as Node;
    const required = (schema as Node).required as string[];

    expect(required.length).toBeGreaterThan(0);
    for (const key of Object.keys(properties)) {
      expect(required).toContain(key);
    }
  });

  it.each(allSchemas)("%s uses uppercase types only", (_name, schema) => {
    walk(schema, (node) => {
      if (typeof node.type === "string") {
        expect(node.type).toMatch(/^[A-Z_]+$/);
      }
    });
  });

  /**
   * Regression: Gemini answers HTTP 400 when an INTEGER property carries an
   * enum of numbers, so the score fields must use minimum/maximum instead.
   * This broke every analysis call before it was found by a manual run.
   */
  it("never puts numbers in an enum", () => {
    for (const [name, schema] of allSchemas) {
      walk(schema, (node) => {
        if (Array.isArray(node.enum)) {
          for (const value of node.enum) {
            expect(typeof value, `${name}: enum ${JSON.stringify(node.enum)}`).toBe(
              "string",
            );
          }
        }
      });
    }
  });

  it("bounds the score fields with minimum and maximum instead", () => {
    const competitor = (
      analysisJsonSchema as Node
    ).properties as Node;
    const items = (competitor.competitors as Node).items as Node;
    const properties = items.properties as Node;

    for (const field of [
      "problemOverlap",
      "customerOverlap",
      "solutionSimilarity",
    ]) {
      const score = (properties[field] as Node).properties as Node;
      const scoreField = score.score as Node;

      expect(scoreField.type).toBe("INTEGER");
      expect(scoreField.minimum).toBe(0);
      expect(scoreField.maximum).toBe(3);
      expect(scoreField.enum).toBeUndefined();
    }
  });

  it("keeps string enums for clarity and pricingModel", () => {
    const profileProperties = (ideaProfileJsonSchema as Node).properties as Node;
    expect((profileProperties.clarity as Node).enum).toEqual(["clear", "vague"]);

    const analysisProperties = (analysisJsonSchema as Node).properties as Node;
    const items = (analysisProperties.competitors as Node).items as Node;
    const pricing = (items.properties as Node).pricingModel as Node;
    expect(pricing.type).toBe("STRING");
    expect((pricing.enum as string[])).toContain("unknown");
  });

  it("orders properties so the model fills them predictably", () => {
    for (const [name, schema] of allSchemas) {
      const ordering = (schema as Node).propertyOrdering as string[];
      const required = (schema as Node).required as string[];
      expect(ordering, name).toEqual(required);
    }
  });
});

describe("summariseProviderError", () => {
  it("lifts error.message out of a Google JSON body", () => {
    const body = JSON.stringify({
      error: {
        code: 400,
        message: "Invalid value at 'generation_config.response_schema'.",
        status: "INVALID_ARGUMENT",
      },
    });

    expect(summariseProviderError(`Gemini request failed (HTTP 400): ${body}`)).toBe(
      "Invalid value at 'generation_config.response_schema'.",
    );
  });

  it("keeps the first line of a plain-text failure", () => {
    expect(summariseProviderError("first line\nsecond line")).toBe("first line");
  });

  it("truncates a very long message", () => {
    const result = summariseProviderError("x".repeat(500));
    expect(result.length).toBeLessThanOrEqual(220);
    expect(result.endsWith("...")).toBe(true);
  });

  it("falls back when there is nothing to read", () => {
    expect(summariseProviderError("   ")).toBe("Unknown Gemini error.");
  });

  it("survives a body that only looks like JSON", () => {
    expect(summariseProviderError("{not json at all")).toBe("{not json at all");
  });
});