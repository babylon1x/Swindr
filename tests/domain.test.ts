import { describe, expect, it } from "vitest";
import { isDenylisted, normalizeDomain } from "@/lib/domain";
import { prepareCandidates } from "@/lib/pipeline/candidates";
import { MAX_CANDIDATES_TO_VERIFY } from "@/lib/config/limits";

describe("normalizeDomain", () => {
  it("reduces a www subdomain to the registrable domain", () => {
    expect(normalizeDomain("www.foo.com")).toBe("foo.com");
  });

  it("strips subdomains", () => {
    expect(normalizeDomain("app.foo.com")).toBe("foo.com");
    expect(normalizeDomain("blog.eng.foo.co.uk")).toBe("foo.co.uk");
  });

  it("accepts a full URL", () => {
    expect(normalizeDomain("https://www.foo.com/pricing?x=1")).toBe("foo.com");
    expect(normalizeDomain("http://blog.foo.co.uk/post")).toBe("foo.co.uk");
  });

  it("lowercases and tolerates surrounding whitespace", () => {
    expect(normalizeDomain("  WWW.FOO.COM  ")).toBe("foo.com");
  });

  it("keeps multi-part public suffixes intact", () => {
    expect(normalizeDomain("www.example.co.uk")).toBe("example.co.uk");
    expect(normalizeDomain("shop.example.com.au")).toBe("example.com.au");
  });

  it("returns null for input with no usable domain", () => {
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain("   ")).toBeNull();
    expect(normalizeDomain("not a domain")).toBeNull();
    expect(normalizeDomain("https://")).toBeNull();
  });

  it("returns null for private/internal suffixes", () => {
    // allowPrivateDomains is off, so local dev names never become candidates.
    expect(normalizeDomain("http://myapp.localhost")).toBeNull();
    expect(normalizeDomain("http://box.local")).toBeNull();
  });
});

describe("isDenylisted", () => {
  it("blocks platform and aggregator domains", () => {
    expect(isDenylisted("g2.com")).toBe(true);
    expect(isDenylisted("medium.com")).toBe(true);
    expect(isDenylisted("producthunt.com")).toBe(true);
    expect(isDenylisted("reddit.com")).toBe(true);
  });

  it("blocks subdomains of a blocked domain", () => {
    expect(isDenylisted("www.g2.com")).toBe(true);
    expect(isDenylisted("news.ycombinator.com")).toBe(true);
  });

  it("allows ordinary company domains", () => {
    expect(isDenylisted("figma.com")).toBe(false);
    expect(isDenylisted("notion.so")).toBe(false);
    expect(isDenylisted("acme-corp.com")).toBe(false);
  });

  it("treats a missing domain as denylisted", () => {
    expect(isDenylisted(null)).toBe(true);
    expect(isDenylisted(undefined)).toBe(true);
    expect(isDenylisted("")).toBe(true);
  });
});

/** Step 2 code-side rules: evidence validation, normalization, dedupe, caps. */
describe("prepareCandidates", () => {
  const allowed = [
    "https://figma.com/pricing",
    "https://blog.example.com/best-tools",
    "https://acme.io/",
  ];

  function candidate(domain: string, evidenceUrl: string, name = "Acme") {
    return { domain, evidenceUrl, name, reason: "solves the same problem" };
  }

  it("keeps only candidates whose evidenceUrl was actually provided", () => {
    const prepared = prepareCandidates(
      [
        candidate("figma.com", "https://figma.com/pricing"),
        candidate("invented.com", "https://totally-made-up.example/page"),
      ],
      allowed,
    );
    expect(prepared.map((item) => item.domain)).toEqual(["figma.com"]);
  });

  it("matches evidenceUrl exactly, not by prefix or similarity", () => {
    const prepared = prepareCandidates(
      [
        candidate("a.com", "https://figma.com/pricing?q=1"),
        candidate("b.com", "https://figma.com/pricing"),
        candidate("c.com", "https://figma.com"),
      ],
      allowed,
    );
    expect(prepared.map((item) => item.domain)).toEqual(["b.com"]);
  });

  it("normalizes domains before deduping", () => {
    const prepared = prepareCandidates(
      [
        candidate("www.figma.com", "https://figma.com/pricing", "Figma"),
        candidate("figma.com", "https://blog.example.com/best-tools", "Figma again"),
      ],
      allowed,
    );
    expect(prepared).toHaveLength(1);
    expect(prepared[0].domain).toBe("figma.com");
    expect(prepared[0].name).toBe("Figma");
  });

  it("drops denylisted platforms", () => {
    const prepared = prepareCandidates(
      [candidate("g2.com", "https://figma.com/pricing", "G2")],
      allowed,
    );
    expect(prepared).toEqual([]);
  });

  it("preserves the AI's relevance order", () => {
    const prepared = prepareCandidates(
      [
        candidate("zeta.com", "https://acme.io/", "Zeta"),
        candidate("alpha.com", "https://figma.com/pricing", "Alpha"),
      ],
      allowed,
    );
    expect(prepared.map((item) => item.domain)).toEqual(["zeta.com", "alpha.com"]);
    expect(prepared.map((item) => item.relevanceIndex)).toEqual([0, 1]);
  });

  it("caps at the verification limit", () => {
    const many = Array.from({ length: 40 }, (_, index) => ({
      domain: `site${index}.com`,
      evidenceUrl: `https://site${index}.com/`,
      name: `Site ${index}`,
      reason: "reason",
    }));

    const prepared = prepareCandidates(many, many.map((item) => item.evidenceUrl));
    expect(MAX_CANDIDATES_TO_VERIFY).toBe(20);
    expect(prepared).toHaveLength(MAX_CANDIDATES_TO_VERIFY);
  });

  it("falls back to the domain when the name is blank", () => {
    const prepared = prepareCandidates(
      [candidate("figma.com", "https://figma.com/pricing", "   ")],
      allowed,
    );
    expect(prepared[0].name).toBe("figma.com");
  });

  it("ignores blank evidence urls in the allowed set", () => {
    const prepared = prepareCandidates(
      [candidate("figma.com", "")],
      ["", "   "],
    );
    expect(prepared).toEqual([]);
  });
});