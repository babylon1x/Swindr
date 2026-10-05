/**
 * Platforms that host content ABOUT companies but are not companies
 * themselves. Pages on these sites may still serve as evidence URLs;
 * they just cannot be returned as competitors.
 *
 * Kept in one config file per the spec.
 */
export const PLATFORM_DENYLIST: readonly string[] = [
  "wikipedia.org",
  "medium.com",
  "reddit.com",
  "youtube.com",
  "linkedin.com",
  "x.com",
  "twitter.com",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "crunchbase.com",
  "g2.com",
  "capterra.com",
  "producthunt.com",
  "trustpilot.com",
  "apps.apple.com",
  "play.google.com",
  "github.com",
  "quora.com",
  "substack.com",
  "news.ycombinator.com",
];
