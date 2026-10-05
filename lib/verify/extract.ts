import { load } from "cheerio";
import { EXTRACT_BODY_TEXT_LIMIT } from "@/lib/config/limits";
import type { ExtractedPage } from "@/lib/storage/briefs";

/**
 * Pulls the homepage text we send to the model: title, meta description,
 * first h1, and the first 1500 characters of visible body text.
 */
export function extractPage(html: string): ExtractedPage {
  const $ = load(html);

  const title = clean($("title").first().text());

  const metaDescription = clean(
    $('meta[name="description"]').attr("content") ??
      $('meta[property="og:description"]').attr("content") ??
      "",
  );

  const heading = clean($("h1").first().text());

  // Strip anything whose text is not visible to a reader.
  $("script, style, noscript, template, iframe, svg, head").remove();

  const bodyText = $("body").text().replace(/\s+/g, " ").trim();

  return {
    ...(title ? { title } : {}),
    ...(metaDescription ? { metaDescription } : {}),
    ...(heading ? { heading } : {}),
    ...(bodyText ? { bodyText: bodyText.slice(0, EXTRACT_BODY_TEXT_LIMIT) } : {}),
  };
}

function clean(value: string | undefined | null): string {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

/** True when we got essentially nothing to work with. */
export function isEmptyExtraction(page: ExtractedPage | undefined): boolean {
  if (!page) return true;
  return !page.title && !page.metaDescription && !page.heading && !page.bodyText;
}
