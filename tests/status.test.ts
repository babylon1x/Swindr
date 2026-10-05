import { describe, expect, it } from "vitest";
import { hasExtractableHtml, isVerifiedStatus } from "@/lib/verify/status";
import { VERIFY_REJECTED_STATUSES } from "@/lib/config/limits";

/** Spec section 7, step 3: verified = any status below 500 except 404/410. */
describe("isVerifiedStatus", () => {
  it("accepts every 2xx", () => {
    for (let status = 200; status <= 299; status += 1) {
      expect(isVerifiedStatus(status)).toBe(true);
    }
  });

  it("accepts 200-range informational and 3xx responses", () => {
    expect(isVerifiedStatus(100)).toBe(true);
    expect(isVerifiedStatus(301)).toBe(true);
    expect(isVerifiedStatus(302)).toBe(true);
    expect(isVerifiedStatus(307)).toBe(true);
    expect(isVerifiedStatus(308)).toBe(true);
  });

  it("accepts 4xx other than 404 and 410", () => {
    // Bot protection and auth walls still prove the site exists.
    for (const status of [400, 401, 402, 403, 405, 418, 429, 451]) {
      expect(isVerifiedStatus(status)).toBe(true);
    }
  });

  it("rejects 404 and 410 explicitly", () => {
    expect(VERIFY_REJECTED_STATUSES).toEqual([404, 410]);
    expect(isVerifiedStatus(404)).toBe(false);
    expect(isVerifiedStatus(410)).toBe(false);
  });

  it("rejects every 5xx", () => {
    for (const status of [500, 502, 503, 504, 599]) {
      expect(isVerifiedStatus(status)).toBe(false);
    }
  });

  it("rejects nonsense status values", () => {
    expect(isVerifiedStatus(0)).toBe(true); // transport failure never reaches here as 0
    expect(isVerifiedStatus(Number.NaN)).toBe(false);
    expect(isVerifiedStatus(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isVerifiedStatus(-1)).toBe(true);
  });
});

describe("hasExtractableHtml", () => {
  it("accepts html on a 2xx", () => {
    expect(hasExtractableHtml(200, "text/html")).toBe(true);
    expect(hasExtractableHtml(200, "text/html; charset=utf-8")).toBe(true);
    expect(hasExtractableHtml(200, "application/xhtml+xml")).toBe(true);
  });

  it("rejects non-html content types", () => {
    expect(hasExtractableHtml(200, "application/pdf")).toBe(false);
    expect(hasExtractableHtml(200, "image/png")).toBe(false);
    expect(hasExtractableHtml(200, "application/json")).toBe(false);
  });

  it("rejects a missing content type", () => {
    expect(hasExtractableHtml(200, null)).toBe(false);
  });

  it("rejects non-2xx statuses even with html", () => {
    expect(hasExtractableHtml(403, "text/html")).toBe(false);
    expect(hasExtractableHtml(302, "text/html")).toBe(false);
  });
});