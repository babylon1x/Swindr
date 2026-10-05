import { VERIFY_REJECTED_STATUSES } from "@/lib/config/limits";

/**
 * A candidate is VERIFIED when DNS resolved and the server returned any HTTP
 * status below 500, except 404 and 410 (spec section 7, step 3).
 */
export function isVerifiedStatus(status: number): boolean {
  if (!Number.isFinite(status)) return false;
  if (status >= 500) return false;
  return !(VERIFY_REJECTED_STATUSES as readonly number[]).includes(status);
}

/** True when a 2xx response carried HTML we could extract from. */
export function hasExtractableHtml(status: number, contentType: string | null): boolean {
  if (status < 200 || status >= 300) return false;
  if (!contentType) return false;
  return /text\/html|application\/xhtml\+xml/i.test(contentType);
}

/** Redirects beyond the cap are treated as unverifiable. */
export const REDIRECT_EXHAUSTED = -1;
