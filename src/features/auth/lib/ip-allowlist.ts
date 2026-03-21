/**
 * Phase 26 — Enterprise & Security: IP Allowlist utilities
 * Pure functions for CIDR matching and IP validation.
 */

export interface AllowlistRule {
  cidr: string;
  label?: string;
  createdAt?: Date;
}

export interface IpCheckResult {
  allowed: boolean;
  matchedRule?: AllowlistRule;
  reason?: string;
}

/**
 * Parse an IPv4 address into a 32-bit integer.
 */
export function parseIpv4(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num) || num < 0 || num > 255) return null;
    result = (result << 8) | num;
  }
  // Convert to unsigned 32-bit
  return result >>> 0;
}

/**
 * Parse a CIDR notation (e.g. "192.168.1.0/24") into network + mask.
 * Returns null if invalid.
 */
export function parseCidr(cidr: string): { network: number; mask: number } | null {
  const [ipPart, prefixPart] = cidr.split("/");
  if (!prefixPart) {
    // Single IP without prefix — treat as /32
    const ip = parseIpv4(ipPart);
    if (ip === null) return null;
    return { network: ip, mask: 0xffffffff };
  }

  const prefix = parseInt(prefixPart, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return null;

  const ip = parseIpv4(ipPart);
  if (ip === null) return null;

  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const network = (ip & mask) >>> 0;
  return { network, mask };
}

/**
 * Check if an IP address matches a CIDR range.
 */
export function ipMatchesCidr(ip: string, cidr: string): boolean {
  const parsed = parseIpv4(ip);
  if (parsed === null) return false;
  const range = parseCidr(cidr);
  if (range === null) return false;
  return (parsed & range.mask) >>> 0 === range.network;
}

/**
 * Check if an IP is valid IPv4.
 */
export function isValidIpv4(ip: string): boolean {
  return parseIpv4(ip) !== null;
}

/**
 * Check if a CIDR string is valid.
 */
export function isValidCidr(cidr: string): boolean {
  return parseCidr(cidr) !== null;
}

/**
 * Check if an IP address is allowed by any rule in the allowlist.
 * If the allowlist is empty, all IPs are allowed (open policy).
 */
export function checkIpAllowlist(
  ip: string,
  rules: AllowlistRule[]
): IpCheckResult {
  if (rules.length === 0) {
    return { allowed: true, reason: "No rules — open access" };
  }

  if (!isValidIpv4(ip)) {
    return { allowed: false, reason: `Invalid IP format: ${ip}` };
  }

  for (const rule of rules) {
    if (ipMatchesCidr(ip, rule.cidr)) {
      return { allowed: true, matchedRule: rule };
    }
  }

  return { allowed: false, reason: `IP ${ip} not in allowlist` };
}

/**
 * Check if an IP is a private/internal address.
 */
export function isPrivateIp(ip: string): boolean {
  const privateRanges = [
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
    "127.0.0.0/8",   // loopback
    "169.254.0.0/16", // link-local
  ];
  return privateRanges.some((cidr) => ipMatchesCidr(ip, cidr));
}

/**
 * Check if an IP is localhost.
 */
export function isLocalhost(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ipMatchesCidr(ip, "127.0.0.0/8");
}

/**
 * Expand CIDR to a human-readable summary.
 */
export function describeCidr(cidr: string): string {
  const range = parseCidr(cidr);
  if (!range) return `Invalid CIDR: ${cidr}`;

  const prefixPart = cidr.includes("/") ? cidr.split("/")[1] : "32";
  const prefix = parseInt(prefixPart, 10);
  const hostBits = 32 - prefix;
  const hosts = hostBits === 0 ? 1 : Math.pow(2, hostBits) - 2;

  if (prefix === 32) return `Single IP: ${cidr.split("/")[0]}`;
  return `${cidr} covers ~${hosts.toLocaleString()} hosts`;
}
