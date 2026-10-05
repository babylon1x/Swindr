import { getDomain } from "tldts";
import { PLATFORM_DENYLIST } from "@/lib/config/denylist";

/**
 * Suffixes that resolve to the local machine or a private network. These are
 * never public competitors, so a candidate on one is rejected outright.
 */
const NON_PUBLIC_SUFFIXES = ["localhost", "local", "internal", "test", "example"];

/**
 * Normalizes a URL or bare host to its registrable domain ("www.foo.co.uk" ->
 * "foo.co.uk"). Returns null when the input is not a usable public domain.
 */
export function normalizeDomain(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;

  // Bare hosts have no scheme; add one so URL parsing is meaningful.
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let hostname: string;
  try {
    hostname = new URL(candidate).hostname.toLowerCase();
  } catch {
    return null;
  }

  if (!hostname) return null;

  const registrable = getDomain(hostname, { allowPrivateDomains: false });
  if (!registrable) return null;

  // Guard against suffixes tldts treats as valid but that never reach the
  // public internet (localhost, .local, .internal, ...).
  const labels = registrable.split(".");
  const suffix = labels.slice(-2).join(".");
  const lastLabel = labels[labels.length - 1];
  if (
    NON_PUBLIC_SUFFIXES.includes(lastLabel) ||
    NON_PUBLIC_SUFFIXES.includes(suffix) ||
    registrable === lastLabel
  ) {
    return null;
  }

  return registrable;
}

/**
 * True when the domain is a platform that hosts content about companies
 * rather than being one. Compared against the normalized registrable domain,
 * with a suffix check so subdomains are caught too.
 */
export function isDenylisted(domain: string | null | undefined): boolean {
  if (!domain) return true;
  const normalized = domain.trim().toLowerCase();
  return PLATFORM_DENYLIST.some(
    (blocked) => normalized === blocked || normalized.endsWith(`.${blocked}`),
  );
}
