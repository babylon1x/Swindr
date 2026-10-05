import fs from "fs/promises";
import path from "path";
import {
  AiOutputError,
  AiQuotaError,
  AiRequestError,
  getAiProvider,
} from "@/lib/ai/client";
import {
  analysisOutputSchema,
  candidatesOutputSchema,
} from "@/lib/ai/schema";
import {
  analysisJsonSchema,
  candidatesJsonSchema,
} from "@/lib/ai/json-schema";
import {
  analysisSystemPrompt,
  buildAnalysisUserPrompt,
  buildCandidatesUserPrompt,
  candidatesSystemPrompt,
} from "@/lib/ai/prompts";
import { SearchBudget, SearchBudgetExceededError } from "@/lib/search/budget";
import { searchOnce } from "@/lib/search/tavily";
import { verifySite } from "@/lib/verify/fetch-site";
import { captureAll } from "@/lib/screenshot/capture";
import { mapWithConcurrency } from "@/lib/pool";
import {
  GEMINI_QUOTA_MESSAGE,
  MAX_COMPETITORS_ANALYZED,
  MAX_SEARCH_QUERIES,
  VERIFY_CONCURRENCY,
} from "@/lib/config/limits";
import {
  getBrief,
  updateBrief,
  type Brief,
  type BriefResult,
  type ScoredCompetitor,
  type VerifiedCompetitor,
} from "@/lib/storage/briefs";
import { briefImagesDir } from "@/lib/storage/paths";
import { prepareCandidates } from "./candidates";
import { classifyAll, sanitizeDesignPatterns } from "./classify";
import { acquireLock, refreshLock, releaseLock } from "./lock";

/**
 * The pipeline: steps 2-5 of spec section 7.
 *
 * Exactly three AI calls per brief (profile, candidates, analysis); the idea
 * profile is created before the brief is run, and `stats.aiRequests` starts at 1
 * to reflect it. Each call may internally retry once on validation failure and
 * up to MAX_AVAILABILITY_RETRIES times on HTTP 503.
 */
export async function runPipeline(briefId: string): Promise<void> {
  // Throws BusyError before any state is touched, so a rejected request cannot
  // mark another brief as failed.
  await acquireLock(briefId);

  let brief = await getBrief(briefId);
  if (!brief) {
    await releaseLock(briefId);
    return;
  }

  try {
    if (!brief.profile) {
      throw new AiOutputError("This brief has no idea profile.", "profile missing");
    }

    const budget = new SearchBudget();
    const provider = getAiProvider();

    // --- Step 2a: search -------------------------------------------------
    await setStage(briefId, "searching");

    const queries = brief.profile.searchQueries
      .map((query) => query.trim())
      .filter(Boolean)
      .slice(0, MAX_SEARCH_QUERIES);

    const searchGroups: {
      query: string;
      results: { title: string; url: string; content: string }[];
    }[] = [];

    // Sequential: the spec forbids parallel Tavily calls.
    for (const query of queries) {
      const outcome = await searchOnce({ query, budget });
      if (outcome.results.length > 0) {
        searchGroups.push({ query: outcome.query, results: outcome.results });
      }
      await updateBrief(briefId, {
        stats: {
          tavilySearches: budget.billableCount,
          tavilyCachedQueries: budget.cachedCount,
          aiRequests: 1, // Idea profile, already completed.
        },
      });
      await refreshLock(briefId);
    }

    if (searchGroups.length === 0) {
      throw new AiRequestError(
        "Search returned no results for any query. Try editing the profile's search queries.",
      );
    }

    // --- Step 2b: candidate extraction (AI request 2) ---------------------
    await setStage(briefId, "extracting");

    const candidatesOutput = await provider.generateJson(
      {
        model: "fast",
        system: candidatesSystemPrompt,
        user: buildCandidatesUserPrompt(brief.profile, searchGroups),
        schema: candidatesJsonSchema,
        temperature: 0.2,
      },
      candidatesOutputSchema,
    );

    const providedUrls = searchGroups.flatMap((group) =>
      group.results.map((result) => result.url),
    );
    const prepared = prepareCandidates(candidatesOutput.candidates, providedUrls);

    await updateBrief(briefId, {
      stats: {
        tavilySearches: budget.billableCount,
        tavilyCachedQueries: budget.cachedCount,
        aiRequests: 2,
      },
    });

    // --- Step 3: verification (no AI) ------------------------------------
    await setStage(briefId, "verifying");
    await refreshLock(briefId);

    const verificationResults = await mapWithConcurrency(
      prepared,
      VERIFY_CONCURRENCY,
      async (candidate) => {
        const result = await verifySite(candidate.domain);
        return { candidate, result };
      },
    );

    const verified: VerifiedCompetitor[] = [];
    for (const { candidate, result } of verificationResults) {
      if (!result.verified) continue;
      verified.push({
        domain: candidate.domain,
        name: candidate.name,
        evidenceUrl: candidate.evidenceUrl,
        reason: candidate.reason,
        finalUrl: result.finalUrl,
        httpStatus: result.httpStatus,
        limitedData: result.limitedData,
        ...(result.extracted ? { extracted: result.extracted } : {}),
        relevanceIndex: candidate.relevanceIndex,
      });
      // Keep the first MAX_COMPETITORS_ANALYZED in relevance order.
      if (verified.length >= MAX_COMPETITORS_ANALYZED) break;
    }

    if (verified.length === 0) {
      throw new AiRequestError(
        "No candidate websites could be verified. The search may have surfaced directories or articles rather than company homepages.",
      );
    }

    // --- Step 4: screenshots (no AI, never fails the brief) ---------------
    await setStage(briefId, "screenshotting");
    await refreshLock(briefId);

    const captures = await captureAll(
      briefId,
      verified.map((item) => ({ domain: item.domain, url: item.finalUrl })),
    );

    verified.forEach((item, index) => {
      const file = captures[index];
      if (file) item.screenshotFile = file;
    });

    await updateBrief(briefId, { verified });

    // --- Step 5: analysis (AI request 3) ---------------------------------
    await setStage(briefId, "analyzing");

    const images = await loadScreenshots(briefId, verified);

    const analysis = await provider.generateJson(
      {
        model: "smart",
        system: analysisSystemPrompt,
        user: buildAnalysisUserPrompt({
          profile: brief.profile,
          competitors: verified.map((item) => ({
            domain: item.domain,
            name: item.name,
            extractedText: item.extracted,
            limitedData: item.limitedData,
            hasScreenshot: Boolean(item.screenshotFile),
          })),
        }),
        schema: analysisJsonSchema,
        images,
        temperature: 0.2,
      },
      analysisOutputSchema,
    );

    // --- Code-side classification ----------------------------------------
    const providedDomains = new Set(verified.map((item) => item.domain));
    const scored = classifyAll(
      analysis.competitors.map((competitor) => {
        const source = verified.find((item) => item.domain === competitor.domain);
        return {
          competitor,
          relevanceIndex: source?.relevanceIndex ?? Number.MAX_SAFE_INTEGER,
        };
      }),
      providedDomains,
    );

    const toScored = (
      entry: (typeof scored)[number],
    ): ScoredCompetitor => {
      const source = verified.find((item) => item.domain === entry.competitor.domain);
      return {
        ...entry.competitor,
        name: source?.name ?? entry.competitor.domain,
        evidenceUrl: source?.evidenceUrl ?? "",
        classification: entry.category,
        overlapScore: entry.overlapScore,
        limitedData: source?.limitedData ?? true,
        ...(source?.screenshotFile ? { screenshotFile: source.screenshotFile } : {}),
        relevanceIndex: entry.relevanceIndex,
      };
    };

    const screenshotDomains = new Set(
      verified.filter((item) => item.screenshotFile).map((item) => item.domain),
    );

    const direct = scored.filter((e) => e.category === "direct").map(toScored);
    const indirect = scored.filter((e) => e.category === "indirect").map(toScored);

    const result: BriefResult = {
      landscapeSummary: analysis.landscapeSummary,
      direct,
      indirect,
      designPatterns: sanitizeDesignPatterns(
        analysis.designPatterns,
        screenshotDomains,
      ),
      opportunities: analysis.opportunities,
      zeroCompetitors: direct.length === 0 && indirect.length === 0,
    };

    brief = (await getBrief(briefId)) ?? brief;
    await updateBrief(briefId, {
      status: "done",
      stage: "done",
      result,
      stats: {
        tavilySearches: budget.billableCount,
        tavilyCachedQueries: budget.cachedCount,
        aiRequests: 3,
      },
    });
  } catch (error) {
    await failBrief(briefId, error);
  } finally {
    await releaseLock(briefId);
  }
}

async function setStage(briefId: string, stage: Brief["stage"]): Promise<void> {
  await updateBrief(briefId, { stage, status: "running" });
}

async function failBrief(briefId: string, error: unknown): Promise<void> {
  let message: string;

  if (error instanceof AiQuotaError) {
    message = error.retryAt
      ? `${GEMINI_QUOTA_MESSAGE} (retry after ${error.retryAt.toLocaleTimeString()})`
      : GEMINI_QUOTA_MESSAGE;
  } else if (error instanceof AiOutputError) {
    message = `The AI returned unusable output twice, so this brief stopped. ${error.issues}`;
  } else if (error instanceof SearchBudgetExceededError) {
    message = error.message;
  } else if (error instanceof AiRequestError) {
    message = error.message;
  } else {
    message = error instanceof Error ? error.message : "Unexpected error.";
  }

  await updateBrief(briefId, { status: "failed", error: message });
}

/** Reads captured screenshots as base64 for AI request 3. */
async function loadScreenshots(
  briefId: string,
  verified: VerifiedCompetitor[],
): Promise<{ mimeType: string; data: string; label: string }[]> {
  const images: { mimeType: string; data: string; label: string }[] = [];

  for (const item of verified) {
    if (!item.screenshotFile) continue;
    try {
      const file = path.join(briefImagesDir(briefId), item.screenshotFile);
      const buffer = await fs.readFile(file);
      images.push({
        mimeType: "image/jpeg",
        data: buffer.toString("base64"),
        // Labelled so request 3 can attribute a design pattern to a domain.
        label: `${item.name} (${item.domain})`,
      });
    } catch {
      // Screenshot vanished; analyse without it.
    }
  }

  return images;
}
