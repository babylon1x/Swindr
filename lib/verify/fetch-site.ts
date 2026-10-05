import { VERIFY_MAX_REDIRECTS, VERIFY_TIMEOUT_MS } from "@/lib/config/limits";
import { isAllowedUrl } from "./ssrf";
import { extractPage } from "./extract";
import { hasExtractableHtml, isVerifiedStatus } from "./status";
import type { ExtractedPage } from "@/lib/storage/briefs";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface VerifyResult {
  verified: boolean;
  finalUrl: string;
  httpStatus: number;
  /** True when we verified the site but could not read its content. */
  limitedData: boolean;
  extracted?: ExtractedPage;
  failureReason?: string;
}

function rejected(
  finalUrl: string,
  httpStatus: number,
  failureReason: string,
): VerifyResult {
  return {
    verified: false,
    finalUrl,
    httpStatus,
    limitedData: false,
    failureReason,
  };
}

function verifiedWithoutContent(
  finalUrl: string,
  httpStatus: number,
): VerifyResult {
  return { verified: true, finalUrl, httpStatus, limitedData: true };
}

/**
 * Fetches a candidate homepage, walking redirects manually so every hop can be
 * re-checked against the SSRF guard (spec section 7, step 3).
 *
 * "Verified" means the site responded with a status below 500 that is not 404
 * or 410. It does NOT mean we could read the page: bot protection and PDFs
 * produce verified-but-unreadable sites, which are kept and flagged
 * `limitedData`.
 */
export async function verifySite(domain: string): Promise<VerifyResult> {
  let currentUrl = `https://${domain}`;

  for (let hop = 0; hop <= VERIFY_MAX_REDIRECTS; hop += 1) {
    const decision = await isAllowedUrl(currentUrl);
    if (!decision.allowed) {
      return rejected(
        currentUrl,
        0,
        decision.reason ?? "Blocked by SSRF guard",
      );
    }

    let response: Response;
    try {
      response = await fetch(currentUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
        },
      });
    } catch (error) {
      return rejected(
        currentUrl,
        0,
        `Request failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }

    const location = response.headers.get("location");
    const isRedirect = response.status >= 300 && response.status < 400 && location;

    if (isRedirect && location) {
      // Release the body so the socket is not held open.
      await response.body?.cancel().catch(() => undefined);
      try {
        currentUrl = new URL(location, currentUrl).toString();
      } catch {
        return rejected(
          currentUrl,
          response.status,
          "Unparseable redirect target",
        );
      }
      continue;
    }

    const status = response.status;

    if (!isVerifiedStatus(status)) {
      await response.body?.cancel().catch(() => undefined);
      return rejected(currentUrl, status, `HTTP ${status} is not a verifiable response`);
    }

    const contentType = response.headers.get("content-type");

    if (!hasExtractableHtml(status, contentType)) {
      await response.body?.cancel().catch(() => undefined);
      return verifiedWithoutContent(currentUrl, status);
    }

    let html: string;
    try {
      html = await response.text();
    } catch {
      return verifiedWithoutContent(currentUrl, status);
    }

    let extracted: ExtractedPage | undefined;
    try {
      extracted = extractPage(html);
    } catch {
      extracted = undefined;
    }

    const hasContent =
      extracted &&
      (extracted.title ||
        extracted.metaDescription ||
        extracted.heading ||
        extracted.bodyText);

    return {
      verified: true,
      finalUrl: currentUrl,
      httpStatus: status,
      limitedData: !hasContent,
      ...(hasContent && extracted ? { extracted } : {}),
    };
  }

  // Ran out of redirect hops without reaching a final response.
  return rejected(currentUrl, 0, `Exceeded ${VERIFY_MAX_REDIRECTS} redirects`);
}