import { describe, expect, it } from "vitest";
import {
  checkHost,
  isAllowedUrl,
  isBlockedHostname,
  isPrivateAddress,
  isPrivateIPv4,
  isPrivateIPv6,
} from "@/lib/verify/ssrf";

/** Private, loopback, link-local and other non-public IPv4 ranges. */
describe("isPrivateIPv4", () => {
  it("blocks loopback", () => {
    expect(isPrivateIPv4("127.0.0.1")).toBe(true);
    expect(isPrivateIPv4("127.255.255.254")).toBe(true);
  });

  it("blocks RFC1918 private ranges", () => {
    expect(isPrivateIPv4("10.0.0.1")).toBe(true);
    expect(isPrivateIPv4("10.255.255.255")).toBe(true);
    expect(isPrivateIPv4("172.16.0.1")).toBe(true);
    expect(isPrivateIPv4("172.31.255.255")).toBe(true);
    expect(isPrivateIPv4("192.168.1.1")).toBe(true);
  });

  it("does not block the public neighbours of the private ranges", () => {
    expect(isPrivateIPv4("9.255.255.255")).toBe(false);
    expect(isPrivateIPv4("11.0.0.0")).toBe(false);
    expect(isPrivateIPv4("172.15.255.255")).toBe(false);
    expect(isPrivateIPv4("172.32.0.0")).toBe(false);
    expect(isPrivateIPv4("192.167.255.255")).toBe(false);
    expect(isPrivateIPv4("192.169.0.0")).toBe(false);
  });

  it("blocks link-local (including cloud metadata) and CGNAT", () => {
    expect(isPrivateIPv4("169.254.169.254")).toBe(true);
    expect(isPrivateIPv4("169.254.0.1")).toBe(true);
    expect(isPrivateIPv4("100.64.0.1")).toBe(true);
  });

  it("blocks this-network, multicast, broadcast and reserved space", () => {
    expect(isPrivateIPv4("0.0.0.0")).toBe(true);
    expect(isPrivateIPv4("224.0.0.1")).toBe(true);
    expect(isPrivateIPv4("239.255.255.255")).toBe(true);
    expect(isPrivateIPv4("255.255.255.255")).toBe(true);
    expect(isPrivateIPv4("240.0.0.1")).toBe(true);
  });

  it("allows ordinary public addresses", () => {
    expect(isPrivateIPv4("1.1.1.1")).toBe(false);
    expect(isPrivateIPv4("8.8.8.8")).toBe(false);
    expect(isPrivateIPv4("93.184.216.34")).toBe(false);
    expect(isPrivateIPv4("223.255.255.255")).toBe(false);
  });

  it("ignores values that are not IPv4 addresses", () => {
    expect(isPrivateIPv4("not-an-ip")).toBe(false);
    expect(isPrivateIPv4("999.1.1.1")).toBe(false);
    expect(isPrivateIPv4("1.1.1")).toBe(false);
  });
});

describe("isPrivateIPv6", () => {
  it("blocks loopback and unspecified", () => {
    expect(isPrivateIPv6("::1")).toBe(true);
    expect(isPrivateIPv6("0:0:0:0:0:0:0:1")).toBe(true);
    expect(isPrivateIPv6("::")).toBe(true);
  });

  it("blocks unique-local and link-local", () => {
    expect(isPrivateIPv6("fc00::1")).toBe(true);
    expect(isPrivateIPv6("fd12:3456::1")).toBe(true);
    expect(isPrivateIPv6("fe80::1")).toBe(true);
  });

  it("blocks multicast", () => {
    expect(isPrivateIPv6("ff02::1")).toBe(true);
  });

  it("unwraps IPv4-mapped and IPv4-compatible forms", () => {
    expect(isPrivateIPv6("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIPv6("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateIPv6("::ffff:192.168.0.1")).toBe(true);
    expect(isPrivateIPv6("::ffff:169.254.169.254")).toBe(true);
    expect(isPrivateIPv6("::ffff:8.8.8.8")).toBe(false);
  });

  it("allows public IPv6", () => {
    expect(isPrivateIPv6("2606:4700:4700::1111")).toBe(false);
    expect(isPrivateIPv6("2001:4860:4860::8888")).toBe(false);
  });
});

describe("isPrivateAddress", () => {
  it("dispatches on the address family", () => {
    expect(isPrivateAddress("192.168.0.1")).toBe(true);
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("1.1.1.1")).toBe(false);
  });
});

describe("isBlockedHostname", () => {
  it("blocks localhost and local suffixes", () => {
    expect(isBlockedHostname("localhost")).toBe(true);
    expect(isBlockedHostname("app.localhost")).toBe(true);
    expect(isBlockedHostname("db.local")).toBe(true);
    expect(isBlockedHostname("svc.internal")).toBe(true);
  });

  it("tolerates case and a trailing dot", () => {
    expect(isBlockedHostname("LOCALHOST")).toBe(true);
    expect(isBlockedHostname("localhost.")).toBe(true);
  });

  it("blocks an empty host", () => {
    expect(isBlockedHostname("")).toBe(true);
  });

  it("allows normal public hostnames", () => {
    expect(isBlockedHostname("figma.com")).toBe(false);
    expect(isBlockedHostname("www.example.co.uk")).toBe(false);
  });
});

describe("checkHost", () => {
  it("rejects localhost before any DNS lookup", async () => {
    const decision = await checkHost("localhost");
    expect(decision.allowed).toBe(false);
  });

  it("rejects literal private IPs without DNS", async () => {
    await expect(checkHost("127.0.0.1")).resolves.toMatchObject({ allowed: false });
    await expect(checkHost("169.254.169.254")).resolves.toMatchObject({ allowed: false });
    await expect(checkHost("10.0.0.5")).resolves.toMatchObject({ allowed: false });
    await expect(checkHost("::1")).resolves.toMatchObject({ allowed: false });
  });

  it("allows a public literal IP", async () => {
    await expect(checkHost("1.1.1.1")).resolves.toMatchObject({ allowed: true });
  });

  it("rejects a public hostname that resolves into private space", async () => {
    // nip.io maps an embedded IP to a real DNS name, so this exercises the
    // "resolves to blocked address" path without mocking DNS.
    await expect(checkHost("127.0.0.1.nip.io")).resolves.toMatchObject({ allowed: false });
  });

  it("allows a public hostname that resolves to a public address", async () => {
    await expect(checkHost("one.one.one.one")).resolves.toMatchObject({ allowed: true });
  });
});

describe("isAllowedUrl", () => {
  it("allows a normal https URL", async () => {
    await expect(isAllowedUrl("https://example.com/pricing")).resolves.toMatchObject({
      allowed: true,
    });
  });

  it("rejects loopback and private literal targets", async () => {
    await expect(isAllowedUrl("https://127.0.0.1/admin")).resolves.toMatchObject({
      allowed: false,
    });
    await expect(isAllowedUrl("http://169.254.169.254/latest/meta-data")).resolves.toMatchObject({
      allowed: false,
    });
    await expect(isAllowedUrl("http://localhost:3000")).resolves.toMatchObject({
      allowed: false,
    });
  });

  it("rejects non-HTTP schemes", async () => {
    await expect(isAllowedUrl("file:///etc/passwd")).resolves.toMatchObject({
      allowed: false,
      reason: expect.stringContaining("scheme"),
    });
    await expect(isAllowedUrl("ftp://example.com")).resolves.toMatchObject({ allowed: false });
    await expect(isAllowedUrl("gopher://example.com")).resolves.toMatchObject({ allowed: false });
  });

  it("rejects an unparseable URL", async () => {
    await expect(isAllowedUrl("not a url")).resolves.toMatchObject({ allowed: false });
  });

  it("rejects a redirect target pointing at private space", async () => {
    // This is the case the redirect walker must catch: the first hop is public,
    // the second is not.
    const redirect = await isAllowedUrl("http://169.254.169.254/latest/meta-data/");
    expect(redirect.allowed).toBe(false);
  });
});