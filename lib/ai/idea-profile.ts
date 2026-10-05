import { getAiProvider } from "./client";
import { ideaProfileJsonSchema } from "./json-schema";
import { ideaProfileSchema, type IdeaProfile } from "./schema";
import {
  buildIdeaProfileUserPrompt,
  ideaProfileSystemPrompt,
} from "./prompts";
import { DEFAULT_MARKET } from "@/lib/config/limits";

/**
 * AI request 1 (spec section 7, step 1). Produces the editable idea profile.
 * Called before a brief exists, so nothing is persisted here.
 */
export async function generateIdeaProfile(input: {
  idea: string;
  targetCustomer?: string;
  market?: string;
}): Promise<IdeaProfile> {
  const market = input.market?.trim() || DEFAULT_MARKET;

  const profile = await getAiProvider().generateJson(
    {
      model: "fast",
      system: ideaProfileSystemPrompt,
      user: buildIdeaProfileUserPrompt({
        idea: input.idea,
        targetCustomer: input.targetCustomer,
        market,
      }),
      schema: ideaProfileJsonSchema,
      temperature: 0.4,
    },
    ideaProfileSchema,
  );

  // Queries are what the pipeline spends credits on; keep within bounds.
  return {
    ...profile,
    searchQueries: profile.searchQueries.slice(0, 8),
  };
}
