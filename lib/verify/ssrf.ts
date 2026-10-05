import dns from "dns/promises";

/**
 * SSRF guard (spec section 7, step 3).
 *
 * Rejects loopback, private, link-local, CGNAT and multicast addresses, plus
 * `localhost` and `*.local` hostnames. Called before the initial request and
 * again on every redirect target.
 */

export interface SsrfDecision {
  allowed: boolean;
  reason?: string;
}

const ALLOWED: SsrfDecision = { allowed: true };

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

function inV4Range(ip: string, cidr: string): boolean {
  const value = ipv4ToInt(ip);
  const [base, bitsRaw] = cidr.split("/");
  const baseValue = ipv4ToInt(base);
  const bits = Number(bitsRaw);
  if (value === null || baseValue === null || !Number.isFinite(bits)) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (0xffffffff << (32 - bits)) >>> 0;
  return ((value & mask) >>> 0) === ((baseValue & mask) >>> 0);
}

const BLOCKED_V4_CIDRS = [
  "0.0.0.0/8", // "this" network
  "10.0.0.0/8", // private
  "100.64.0.0/10", // CGNAT
  "127.0.0.0/8", // loopback
  "169.254.0.0/16", // link-local
  "172.16.0.0/12", // private
  "192.0.0.0/24", // IETF protocol assignments
  "192.0.2.0/24", // TEST-NET-1
  "192.88.99.0/24", // 6to4 relay anycast
  "192.168.0.0/16", // private
  "198.18.0.0/15", // benchmarking
  "198.51.100.0/24", // TEST-NET-2
  "203.0.113.0/24", // TEST-NET-3
  "224.0.0.0/4", // multicast
  "240.0.0.0/4", // reserved (includes 255.255.255.255)
];

export function isPrivateIPv4(ip: string): boolean {
  return BLOCKED_V4_CIDRS.some((cidr) => inV4Range(ip, cidr));
}

export function isPrivateIPv6(input: string): boolean {
  // Drop any zone index, e.g. fe80::1%eth0
  const ip = input.split("%")[0].toLowerCase();
  if (!ip.includes(":")) return false;

  const isLoopback =
    ip === "::1" || ip === "0:0:0:0:0:0:0:1" || ip === "0000:0000:0000:0000:0000:0000:0000:0001";
  if (isLoopback) return true;

  // Unspecified address "::" (and any all-zero form of it).
  if (/^[0:]+$/.test(ip)) return true;

  // IPv4-mapped (::ffff:127.0.0.1) and IPv4-compatible forms.
  const mapped = /^::(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (mapped) return isPrivateIPv4(mapped[1]);

  const firstGroup = Number.parseInt(ip.split(":")[0] || "0", 16);

  // fc00::/7 unique local, fe80::/10 link-local, ff00::/8 multicast.
  if ((firstGroup & 0xfe00) === 0xfc00) return true;
  if ((firstGroup & 0xffc0) === 0xfe80) return true;
  if ((firstGroup & 0xff00) === 0xff00) return true;

  return false;
}

/** True when a literal IP address is one we must never fetch. */
export function isPrivateAddress(ip: string): boolean {
  const value = ip.trim();
  if (value.includes(":")) return isPrivateIPv6(value);
  return isPrivateIPv4(value);
}

/** Hostname-level rejections that do not need DNS. */
export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (host === "localhost") return true;
  if (host.endsWith(".localhost")) return true;
  if (host.endsWith(".local")) return true;
  if (host.endsWith(".internal")) return true;
  return false;
}

/**
 * Resolves DNS and rejects when the host is blocked or every address is
 * private. A host that resolves to a mix is rejected too: safer.
 */
export async function checkHost(hostname: string): Promise<SsrfDecision> {
  const host = hostname.trim().toLowerCase();

  if (isBlockedHostname(host)) {
    return { allowed: false, reason: `Blocked hostname: ${host}` };
  }

  // A literal IP needs no resolution.
  if (isPrivateAddress(host)) {
    return { allowed: false, reason: `Blocked address: ${host}` };
  }

  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    return { allowed: false, reason: `DNS resolution failed for ${host}` };
  }

  if (addresses.length === 0) {
    return { allowed: false, reason: `DNS returned no addresses for ${host}` };
  }

  for (const entry of addresses) {
    if (isPrivateAddress(entry.address)) {
      return {
        allowed: false,
        reason: `Resolves to blocked address ${entry.address}`,
      };
    }
  }

  return ALLOWED;
}

/** Convenience wrapper used by the redirect walker. */
export async function isAllowedUrl(url: string): Promise<SsrfDecision> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: "Unparseable URL" };
  }

  // Only ever fetch over HTTP(S); a redirect must not switch scheme (e.g. to
  // file:, ftp: or gopher:).
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { allowed: false, reason: `Blocked scheme: ${parsed.protocol}` };
  }

  return checkHost(parsed.hostname);
}
