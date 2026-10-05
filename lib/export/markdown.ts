import {
  FOOTER_DISCLAIMER,
  MAX_DIRECT_CARDS,
  MAX_INDIRECT_CARDS,
  NO_COMPETITORS_MESSAGE,
} from "@/lib/config/limits";
import type { Brief, ScoredCompetitor } from "@/lib/storage/briefs";

/**
 * Markdown export (spec section 10). Screenshots are referenced by site name
 * only, never embedded.
 */
export function briefToMarkdown(brief: Brief): string {
  const lines: string[] = [];
  const profile = brief.profile;

  lines.push(`# Competitor brief: ${profile?.summary ?? "Untitled idea"}`);
  lines.push("");
  lines.push(`**Made:** ${formatDate(brief.createdAt)}`);
  lines.push("");

  // a. Idea profile
  lines.push("## Idea profile");
  lines.push("");
  if (profile) {
    lines.push(`- **Idea:** ${brief.input.idea}`);
    if (brief.input.targetCustomer) {
      lines.push(`- **Target customer (as entered):** ${brief.input.targetCustomer}`);
    }
    lines.push(`- **Market / region:** ${brief.input.market || "Global"}`);
    lines.push(`- **Problem:** ${profile.problem}`);
    lines.push(`- **Target customer:** ${profile.targetCustomer}`);
    lines.push(`- **Solution type:** ${profile.solutionType}`);
    lines.push(`- **Category:** ${profile.category}`);
    lines.push(`- **Key features:** ${profile.keyFeatures.join("; ")}`);
    lines.push("");
    lines.push("**Search queries used:**");
    profile.searchQueries.forEach((query) => lines.push(`- ${query}`));
  }
  lines.push("");

  if (brief.status === "failed") {
    lines.push("## Failed");
    lines.push("");
    lines.push(brief.error ?? "This brief did not complete.");
    lines.push("");
    return lines.join("\n");
  }

  const result = brief.result;

  // b. Landscape summary
  if (result) {
    lines.push("## Landscape summary");
    lines.push("");
    lines.push(result.landscapeSummary);
    lines.push("");

    if (result.zeroCompetitors) {
      lines.push(`> ${NO_COMPETITORS_MESSAGE}`);
      lines.push("");
    }

    // c. Direct competitors
    lines.push(`## Direct competitors (${result.direct.length})`);
    lines.push("");
    if (result.direct.length === 0) {
      lines.push("_None._");
      lines.push("");
    } else {
      result.direct
        .slice(0, MAX_DIRECT_CARDS)
        .forEach((competitor) => lines.push(...competitorLines(competitor)));
    }

    // d. Indirect competitors
    lines.push(`## Indirect competitors (${result.indirect.length})`);
    lines.push("");
    if (result.indirect.length === 0) {
      lines.push("_None._");
      lines.push("");
    } else {
      result.indirect
        .slice(0, MAX_INDIRECT_CARDS)
        .forEach((competitor) => lines.push(...competitorLines(competitor)));
    }

    // e. More: anything beyond the first 6 of each category
    const more = [
      ...result.direct.slice(MAX_DIRECT_CARDS),
      ...result.indirect.slice(MAX_INDIRECT_CARDS),
    ];
    if (more.length > 0) {
      lines.push(`## More (${more.length})`);
      lines.push("");
      for (const competitor of more) {
        lines.push(
          `- [${competitor.name}](https://${competitor.domain}) — ${competitor.classification}, overlap ${competitor.overlapScore}%`,
        );
      }
      lines.push("");
    }

    // f. Visual gallery + patterns
    const withScreenshots = [...result.direct, ...result.indirect].filter(
      (competitor) => competitor.screenshotFile,
    );
    if (withScreenshots.length > 0) {
      lines.push("## Visual gallery");
      lines.push("");
      lines.push("_Screenshots captured (referenced by site name, not embedded):_");
      lines.push("");
      for (const competitor of withScreenshots) {
        lines.push(`- ${competitor.name} — https://${competitor.domain}`);
      }
      lines.push("");
    }

    if (result.designPatterns.length > 0) {
      lines.push("### Shared design patterns");
      lines.push("");
      for (const pattern of result.designPatterns) {
        lines.push(`- **${pattern.pattern}** — ${pattern.domains.join(", ")}`);
      }
      lines.push("");
    }

    // g. Opportunities
    lines.push("## Opportunities to stand out");
    lines.push("");
    for (const opportunity of result.opportunities) {
      lines.push(`- **${opportunity.title}** — ${opportunity.explanation}`);
    }
    lines.push("");
  }

  // h. Footer note
  lines.push("---");
  lines.push("");
  lines.push(`_${FOOTER_DISCLAIMER}_`);
  lines.push("");

  return lines.join("\n");
}

function competitorLines(competitor: ScoredCompetitor): string[] {
  const lines: string[] = [];
  lines.push(`### [${competitor.name}](https://${competitor.domain})`);
  lines.push("");
  lines.push(`- **Overlap score:** ${competitor.overlapScore}/100`);
  lines.push(`- **Positioning:** ${competitor.positioning}`);
  lines.push(`- **Pricing model:** ${competitor.pricingModel}`);
  if (competitor.limitedData) {
    lines.push("- **Limited data:** homepage content could not be read");
  }
  if (competitor.screenshotFile) {
    lines.push(`- **Screenshot captured:** yes`);
  } else {
    lines.push("- **Screenshot captured:** no");
  }
  lines.push(
    `- **problemOverlap ${competitor.problemOverlap.score}/3:** ${competitor.problemOverlap.reason}`,
  );
  lines.push(
    `- **customerOverlap ${competitor.customerOverlap.score}/3:** ${competitor.customerOverlap.reason}`,
  );
  lines.push(
    `- **solutionSimilarity ${competitor.solutionSimilarity.score}/3:** ${competitor.solutionSimilarity.reason}`,
  );
  if (competitor.strengths.length > 0) {
    lines.push(`- **Strengths:** ${competitor.strengths.join("; ")}`);
  }
  if (competitor.gaps.length > 0) {
    lines.push(`- **Gaps:** ${competitor.gaps.join("; ")}`);
  }
  if (competitor.evidenceUrl) {
    lines.push(`- **Evidence:** ${competitor.evidenceUrl}`);
  }
  lines.push("");
  return lines;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}
