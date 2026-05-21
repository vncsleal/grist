import * as dns from "node:dns/promises";

// Private and reserved IPv4 ranges (RFC 1918, RFC 6598, loopback, link-local)
const PRIVATE_RANGES: Array<{ base: number; mask: number }> = [
  { base: ipv4ToInt("10.0.0.0"), mask: cidrMask(8) },
  { base: ipv4ToInt("172.16.0.0"), mask: cidrMask(12) },
  { base: ipv4ToInt("192.168.0.0"), mask: cidrMask(16) },
  { base: ipv4ToInt("127.0.0.0"), mask: cidrMask(8) },
  { base: ipv4ToInt("169.254.0.0"), mask: cidrMask(16) },
  { base: ipv4ToInt("100.64.0.0"), mask: cidrMask(10) },
  { base: ipv4ToInt("0.0.0.0"), mask: cidrMask(8) },
  { base: ipv4ToInt("198.18.0.0"), mask: cidrMask(15) },
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

function cidrMask(prefix: number): number {
  return (~(2 ** (32 - prefix) - 1)) >>> 0;
}

function isPrivateIPv4(hostname: string): boolean {
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return false;
  const parts = hostname.split(".").map(Number);
  if (parts.some(p => p < 0 || p > 255)) return false;
  const ip = ipv4ToInt(hostname);
  for (const range of PRIVATE_RANGES) {
    if (((ip & range.mask) >>> 0) === range.base) return true;
  }
  return false;
}

function isPrivateIPv6(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === "::1") return true;
  // URL parser normalizes IPv4-mapped IPv6 to hex form (::ffff:7f00:1 = ::ffff:127.0.0.1)
  if (lower === "::ffff:7f00:1" || lower === "::ffff:127.0.0.1") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("fe80")) return true;
  return false;
}

function isPrivateHostname(hostname: string): boolean {
  const addr = hostname.replace(/^\[|\]$/g, "");
  const isBareIp = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(addr) || addr.includes(":");
  if (!isBareIp) return false;
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(addr)) return isPrivateIPv4(addr);
  return isPrivateIPv6(addr);
}

export async function validateUrl(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`SSRF blocked: non-HTTP protocol "${parsed.protocol}"`);
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (isPrivateHostname(hostname)) {
    throw new Error(`SSRF blocked: private IP "${hostname}"`);
  }
  // Resolve DNS hostnames to check for internal IPs
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) && !hostname.includes(":")) {
    const addresses = await dns.resolve4(hostname);
    for (const addr of addresses) {
      if (isPrivateIPv4(addr)) {
        throw new Error(
          `SSRF blocked: DNS resolved to private IP "${addr}" for host "${hostname}"`
        );
      }
    }
  }
}

export interface SafeFetchOptions extends RequestInit {
  maxRedirects?: number;
  timeout?: number;
}

export async function safeFetch(
  url: string,
  options: SafeFetchOptions = {}
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? 5;
  const timeout = options.timeout ?? 10_000;
  const { maxRedirects: _mr, timeout: _to, ...fetchOptions } = options as Record<string, unknown>;

  await validateUrl(url);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      redirect: "manual",
    } as RequestInit);

    if (response.status >= 300 && response.status < 400 && maxRedirects > 0) {
      const location = response.headers.get("location");
      if (location) {
        const redirectUrl = new URL(location, url).href;
        return safeFetch(redirectUrl, { ...options, maxRedirects: maxRedirects - 1 });
      }
    }

    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
