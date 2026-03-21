import { describe, it, expect } from "vitest";
import {
  parseIpv4,
  parseCidr,
  ipMatchesCidr,
  isValidIpv4,
  isValidCidr,
  checkIpAllowlist,
  isPrivateIp,
  isLocalhost,
  describeCidr,
  type AllowlistRule,
} from "./ip-allowlist";

describe("parseIpv4", () => {
  it("parses valid IPs", () => {
    expect(parseIpv4("192.168.1.1")).toBeGreaterThan(0);
    expect(parseIpv4("0.0.0.0")).toBe(0);
    expect(parseIpv4("255.255.255.255")).toBe(0xffffffff);
  });

  it("returns null for invalid IPs", () => {
    expect(parseIpv4("999.0.0.1")).toBeNull();
    expect(parseIpv4("abc")).toBeNull();
    expect(parseIpv4("1.2.3")).toBeNull();
    expect(parseIpv4("1.2.3.4.5")).toBeNull();
  });
});

describe("parseCidr", () => {
  it("parses valid CIDR", () => {
    const result = parseCidr("192.168.0.0/16");
    expect(result).not.toBeNull();
    expect(result!.mask).toBe(0xffff0000);
  });

  it("handles single IP without prefix", () => {
    const result = parseCidr("10.0.0.1");
    expect(result).not.toBeNull();
    expect(result!.mask).toBe(0xffffffff);
  });

  it("returns null for invalid CIDR", () => {
    expect(parseCidr("256.0.0.0/24")).toBeNull();
    expect(parseCidr("192.168.0.0/33")).toBeNull();
    expect(parseCidr("notanip/24")).toBeNull();
  });
});

describe("ipMatchesCidr", () => {
  it("matches IP within range", () => {
    expect(ipMatchesCidr("192.168.1.100", "192.168.0.0/16")).toBe(true);
    expect(ipMatchesCidr("10.0.0.255", "10.0.0.0/8")).toBe(true);
  });

  it("rejects IP outside range", () => {
    expect(ipMatchesCidr("192.169.0.1", "192.168.0.0/16")).toBe(false);
    expect(ipMatchesCidr("11.0.0.1", "10.0.0.0/8")).toBe(false);
  });

  it("matches exact IP with /32", () => {
    expect(ipMatchesCidr("1.2.3.4", "1.2.3.4/32")).toBe(true);
    expect(ipMatchesCidr("1.2.3.5", "1.2.3.4/32")).toBe(false);
  });

  it("/0 matches all IPs", () => {
    expect(ipMatchesCidr("8.8.8.8", "0.0.0.0/0")).toBe(true);
    expect(ipMatchesCidr("255.255.255.255", "0.0.0.0/0")).toBe(true);
  });
});

describe("isValidIpv4", () => {
  it("validates correct IPs", () => {
    expect(isValidIpv4("10.0.0.1")).toBe(true);
    expect(isValidIpv4("8.8.8.8")).toBe(true);
  });

  it("rejects invalid IPs", () => {
    expect(isValidIpv4("999.0.0.1")).toBe(false);
    expect(isValidIpv4("hello")).toBe(false);
  });
});

describe("isValidCidr", () => {
  it("accepts valid CIDRs", () => {
    expect(isValidCidr("192.168.0.0/24")).toBe(true);
    expect(isValidCidr("10.0.0.0/8")).toBe(true);
    expect(isValidCidr("1.2.3.4")).toBe(true); // single IP
  });

  it("rejects invalid CIDRs", () => {
    expect(isValidCidr("256.0.0.0/8")).toBe(false);
    expect(isValidCidr("1.2.3.4/33")).toBe(false);
  });
});

describe("checkIpAllowlist", () => {
  const rules: AllowlistRule[] = [
    { cidr: "192.168.0.0/16", label: "Internal" },
    { cidr: "203.0.113.50/32", label: "Office" },
  ];

  it("allows all when rules are empty", () => {
    const result = checkIpAllowlist("8.8.8.8", []);
    expect(result.allowed).toBe(true);
  });

  it("allows matching IP", () => {
    const result = checkIpAllowlist("192.168.5.10", rules);
    expect(result.allowed).toBe(true);
    expect(result.matchedRule?.label).toBe("Internal");
  });

  it("rejects non-matching IP", () => {
    const result = checkIpAllowlist("8.8.8.8", rules);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not in allowlist");
  });

  it("rejects invalid IP", () => {
    const result = checkIpAllowlist("not-an-ip", rules);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Invalid IP");
  });
});

describe("isPrivateIp", () => {
  it("identifies private ranges", () => {
    expect(isPrivateIp("10.0.0.1")).toBe(true);
    expect(isPrivateIp("172.16.0.1")).toBe(true);
    expect(isPrivateIp("192.168.1.1")).toBe(true);
    expect(isPrivateIp("127.0.0.1")).toBe(true);
  });

  it("identifies public IPs as non-private", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("1.1.1.1")).toBe(false);
  });
});

describe("isLocalhost", () => {
  it("identifies localhost addresses", () => {
    expect(isLocalhost("127.0.0.1")).toBe(true);
    expect(isLocalhost("::1")).toBe(true);
    expect(isLocalhost("127.0.0.255")).toBe(true);
  });

  it("rejects non-localhost", () => {
    expect(isLocalhost("192.168.1.1")).toBe(false);
    expect(isLocalhost("8.8.8.8")).toBe(false);
  });
});

describe("describeCidr", () => {
  it("describes single IP for /32", () => {
    expect(describeCidr("1.2.3.4/32")).toContain("Single IP");
  });

  it("describes host count for ranges", () => {
    const desc = describeCidr("192.168.0.0/24");
    expect(desc).toContain("192.168.0.0/24");
    expect(desc).toContain("hosts");
  });

  it("returns error for invalid CIDR", () => {
    expect(describeCidr("invalid")).toContain("Invalid");
  });
});
