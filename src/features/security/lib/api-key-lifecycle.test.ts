import { describe, it, expect } from "vitest";
import {
  buildKeyPrefix,
  hashApiKey,
  maskApiKey,
  verifyApiKey,
  validateApiKey,
  createApiKey,
  revokeApiKey,
  recordKeyUsage,
  rotateApiKey,
  isKeyValid,
  isKeyExpired,
  getDaysUntilExpiry,
  hasScope,
  isIpAllowed,
  buildUsageSummary,
  createAuditEntry,
  getAuditEntriesForKey,
  getKeysExpiringWithin,
  summarizeKeys,
  type ApiKey,
} from "./api-key-lifecycle";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: "key1",
    prefix: "pn_live_",
    hash: hashApiKey("pn_live_abc123"),
    name: "My API Key",
    tier: "personal",
    scopes: ["read:workflows"],
    status: "active",
    createdAt: new Date("2025-01-01"),
    createdBy: "user1",
    usageCount: 0,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// buildKeyPrefix
// ─────────────────────────────────────────────────────────────────────────────

describe("buildKeyPrefix", () => {
  it("builds personal live prefix", () => expect(buildKeyPrefix("personal")).toBe("pn_live_"));
  it("builds service test prefix", () => expect(buildKeyPrefix("service", "test")).toBe("svc_test_"));
  it("builds integration live prefix", () => expect(buildKeyPrefix("integration")).toBe("int_live_"));
  it("builds admin live prefix", () => expect(buildKeyPrefix("admin")).toBe("adm_live_"));
});

// ─────────────────────────────────────────────────────────────────────────────
// hashApiKey / verifyApiKey
// ─────────────────────────────────────────────────────────────────────────────

describe("hashApiKey", () => {
  it("returns a non-empty string", () => {
    expect(hashApiKey("mykey")).toBeTruthy();
  });

  it("is deterministic", () => {
    expect(hashApiKey("mykey")).toBe(hashApiKey("mykey"));
  });

  it("differs for different keys", () => {
    expect(hashApiKey("key1")).not.toBe(hashApiKey("key2"));
  });

  it("starts with sha256:", () => {
    expect(hashApiKey("test")).toMatch(/^sha256:/);
  });
});

describe("verifyApiKey", () => {
  it("returns true for matching key", () => {
    const hash = hashApiKey("secret-key");
    expect(verifyApiKey("secret-key", hash)).toBe(true);
  });

  it("returns false for non-matching key", () => {
    const hash = hashApiKey("secret-key");
    expect(verifyApiKey("wrong-key", hash)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// maskApiKey
// ─────────────────────────────────────────────────────────────────────────────

describe("maskApiKey", () => {
  it("masks key showing prefix + first chars + ****", () => {
    const masked = maskApiKey("pn_live_abcdefghijklmno");
    expect(masked).toContain("****");
    expect(masked.startsWith("pn_live_abc")).toBe(true);
  });

  it("handles short keys", () => {
    const masked = maskApiKey("short");
    expect(masked).toContain("****");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateApiKey
// ─────────────────────────────────────────────────────────────────────────────

describe("validateApiKey", () => {
  it("accepts valid key config", () => {
    const result = validateApiKey({
      name: "Test Key",
      scopes: ["read:workflows"],
      tier: "personal",
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("errors on missing name", () => {
    const result = validateApiKey({ scopes: ["read:workflows"] });
    expect(result.errors).toContain("name is required");
  });

  it("errors on empty name", () => {
    const result = validateApiKey({ name: "  ", scopes: ["read:workflows"] });
    expect(result.errors).toContain("name is required");
  });

  it("errors on name > 100 chars", () => {
    const result = validateApiKey({ name: "a".repeat(101), scopes: ["read:workflows"] });
    expect(result.errors).toContain("name must be 100 characters or fewer");
  });

  it("errors on missing scopes", () => {
    const result = validateApiKey({ name: "Test", scopes: [] });
    expect(result.errors).toContain("at least one scope is required");
  });

  it("errors on invalid scope", () => {
    const result = validateApiKey({ name: "Test", scopes: ["invalid:scope" as never] });
    expect(result.errors.some((e) => e.includes("invalid scopes"))).toBe(true);
  });

  it("warns when admin scope with other scopes", () => {
    const result = validateApiKey({ name: "Test", scopes: ["admin", "read:workflows"] });
    expect(result.warnings.some((w) => w.includes("admin scope"))).toBe(true);
  });

  it("errors when expiresAt is in the past", () => {
    const result = validateApiKey({
      name: "Test",
      scopes: ["read:workflows"],
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(result.errors).toContain("expiresAt must be in the future");
  });

  it("warns when expiry < 7 days", () => {
    const result = validateApiKey({
      name: "Test",
      scopes: ["read:workflows"],
      expiresAt: new Date(Date.now() + 3 * 86_400_000),
    });
    expect(result.warnings.some((w) => w.includes("7 days"))).toBe(true);
  });

  it("errors on rateLimitPerMinute < 1", () => {
    const result = validateApiKey({ name: "Test", scopes: ["read:workflows"], rateLimitPerMinute: 0 });
    expect(result.errors).toContain("rateLimitPerMinute must be at least 1");
  });

  it("errors on invalid IP address", () => {
    const result = validateApiKey({ name: "Test", scopes: ["read:workflows"], allowedIps: ["999.0.0.1"] });
    expect(result.errors.some((e) => e.includes("invalid IP"))).toBe(true);
  });

  it("accepts valid CIDR notation", () => {
    const result = validateApiKey({
      name: "Test",
      scopes: ["read:workflows"],
      allowedIps: ["192.168.1.0/24"],
    });
    expect(result.valid).toBe(true);
  });

  it("warns when admin tier without IP restriction", () => {
    const result = validateApiKey({ name: "Admin", scopes: ["admin"], tier: "admin" });
    expect(result.warnings.some((w) => w.includes("admin keys"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createApiKey
// ─────────────────────────────────────────────────────────────────────────────

describe("createApiKey", () => {
  it("creates a key with active status", () => {
    const key = createApiKey({
      id: "k1", prefix: "pn_live_", hash: "sha256:abc",
      name: "Test", tier: "personal", scopes: ["read:workflows"], createdBy: "user1",
    });
    expect(key.status).toBe("active");
    expect(key.usageCount).toBe(0);
  });

  it("deduplicates scopes", () => {
    const key = createApiKey({
      id: "k1", prefix: "pn_live_", hash: "sha256:abc",
      name: "Test", tier: "personal", scopes: ["read:workflows", "read:workflows"], createdBy: "user1",
    });
    expect(key.scopes.filter((s) => s === "read:workflows")).toHaveLength(1);
  });

  it("sets createdAt to now", () => {
    const before = Date.now();
    const key = createApiKey({
      id: "k1", prefix: "pn_live_", hash: "sha256:abc",
      name: "Test", tier: "personal", scopes: ["read:workflows"], createdBy: "user1",
    });
    expect(key.createdAt.getTime()).toBeGreaterThanOrEqual(before);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// revokeApiKey
// ─────────────────────────────────────────────────────────────────────────────

describe("revokeApiKey", () => {
  it("sets status to revoked", () => {
    const key = makeKey();
    const revoked = revokeApiKey(key, { revokedBy: "admin", reason: "Compromised" });
    expect(revoked.status).toBe("revoked");
    expect(revoked.revokedBy).toBe("admin");
    expect(revoked.revokeReason).toBe("Compromised");
  });

  it("does not mutate original", () => {
    const key = makeKey();
    revokeApiKey(key, { revokedBy: "admin" });
    expect(key.status).toBe("active");
  });

  it("sets revokedAt timestamp", () => {
    const now = new Date("2025-06-01");
    const revoked = revokeApiKey(makeKey(), { revokedBy: "admin", now });
    expect(revoked.revokedAt).toEqual(now);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// recordKeyUsage
// ─────────────────────────────────────────────────────────────────────────────

describe("recordKeyUsage", () => {
  it("increments usage count", () => {
    const key = makeKey({ usageCount: 5 });
    const updated = recordKeyUsage(key);
    expect(updated.usageCount).toBe(6);
  });

  it("updates lastUsedAt", () => {
    const now = new Date("2025-06-01");
    const updated = recordKeyUsage(makeKey(), now);
    expect(updated.lastUsedAt).toEqual(now);
  });

  it("does not mutate original", () => {
    const key = makeKey({ usageCount: 0 });
    recordKeyUsage(key);
    expect(key.usageCount).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// rotateApiKey
// ─────────────────────────────────────────────────────────────────────────────

describe("rotateApiKey", () => {
  it("marks old key as rotated", () => {
    const old = makeKey({ id: "old" });
    const newKey = makeKey({ id: "new" });
    const { oldKey } = rotateApiKey(old, newKey);
    expect(oldKey.status).toBe("rotated");
    expect(oldKey.rotatedToId).toBe("new");
  });

  it("links new key to old key", () => {
    const old = makeKey({ id: "old" });
    const newKey = makeKey({ id: "new" });
    const { newKey: rotatedNew } = rotateApiKey(old, newKey);
    expect(rotatedNew.rotatedFromId).toBe("old");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isKeyValid / isKeyExpired / getDaysUntilExpiry
// ─────────────────────────────────────────────────────────────────────────────

describe("isKeyValid", () => {
  it("returns true for active non-expired key", () => {
    const key = makeKey({ expiresAt: new Date(Date.now() + 86_400_000) });
    expect(isKeyValid(key)).toBe(true);
  });

  it("returns false for revoked key", () => {
    expect(isKeyValid(makeKey({ status: "revoked" }))).toBe(false);
  });

  it("returns false for expired key", () => {
    const key = makeKey({ expiresAt: new Date(Date.now() - 1000) });
    expect(isKeyValid(key)).toBe(false);
  });

  it("returns true with no expiry", () => {
    expect(isKeyValid(makeKey())).toBe(true);
  });
});

describe("isKeyExpired", () => {
  it("returns false when no expiresAt", () => {
    expect(isKeyExpired(makeKey())).toBe(false);
  });

  it("returns true when past expiresAt", () => {
    const key = makeKey({ expiresAt: new Date("2020-01-01") });
    expect(isKeyExpired(key)).toBe(true);
  });

  it("returns false when expiresAt in future", () => {
    const key = makeKey({ expiresAt: new Date(Date.now() + 86_400_000) });
    expect(isKeyExpired(key)).toBe(false);
  });
});

describe("getDaysUntilExpiry", () => {
  it("returns null when no expiresAt", () => {
    expect(getDaysUntilExpiry(makeKey())).toBeNull();
  });

  it("returns positive days for future expiry", () => {
    const now = new Date("2025-01-01");
    const key = makeKey({ expiresAt: new Date("2025-01-31") });
    const days = getDaysUntilExpiry(key, now);
    expect(days).toBeCloseTo(30, 0);
  });

  it("returns negative days for past expiry", () => {
    const now = new Date("2025-02-01");
    const key = makeKey({ expiresAt: new Date("2025-01-01") });
    const days = getDaysUntilExpiry(key, now);
    expect(days).toBeLessThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// hasScope
// ─────────────────────────────────────────────────────────────────────────────

describe("hasScope", () => {
  it("returns true when scope is included", () => {
    expect(hasScope(makeKey({ scopes: ["read:workflows"] }), "read:workflows")).toBe(true);
  });

  it("returns false when scope is not included", () => {
    expect(hasScope(makeKey({ scopes: ["read:workflows"] }), "write:workflows")).toBe(false);
  });

  it("admin scope grants all", () => {
    expect(hasScope(makeKey({ scopes: ["admin"] }), "manage:credentials")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isIpAllowed
// ─────────────────────────────────────────────────────────────────────────────

describe("isIpAllowed", () => {
  it("allows all IPs when no restriction", () => {
    expect(isIpAllowed(makeKey(), "1.2.3.4")).toBe(true);
  });

  it("allows exact matching IP", () => {
    const key = makeKey({ allowedIps: ["192.168.1.1"] });
    expect(isIpAllowed(key, "192.168.1.1")).toBe(true);
  });

  it("blocks non-matching IP", () => {
    const key = makeKey({ allowedIps: ["192.168.1.1"] });
    expect(isIpAllowed(key, "10.0.0.1")).toBe(false);
  });

  it("allows IP within CIDR range", () => {
    const key = makeKey({ allowedIps: ["192.168.1.0/24"] });
    expect(isIpAllowed(key, "192.168.1.100")).toBe(true);
  });

  it("blocks IP outside CIDR range", () => {
    const key = makeKey({ allowedIps: ["192.168.1.0/24"] });
    expect(isIpAllowed(key, "192.168.2.1")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildUsageSummary
// ─────────────────────────────────────────────────────────────────────────────

describe("buildUsageSummary", () => {
  it("reports correct fields", () => {
    const now = new Date("2025-06-01");
    const key = makeKey({
      usageCount: 42,
      lastUsedAt: new Date("2025-05-30"),
      expiresAt: new Date("2025-07-01"),
    });
    const summary = buildUsageSummary(key, now);
    expect(summary.usageCount).toBe(42);
    expect(summary.lastUsedAt).toEqual(new Date("2025-05-30"));
    expect(summary.isExpired).toBe(false);
    expect(summary.isRevoked).toBe(false);
    expect(summary.daysUntilExpiry).toBeGreaterThan(0);
  });

  it("shows admin scope summary", () => {
    const summary = buildUsageSummary(makeKey({ scopes: ["admin"] }));
    expect(summary.scopeSummary).toBe("admin (all)");
  });

  it("shows all scopes joined", () => {
    const summary = buildUsageSummary(makeKey({ scopes: ["read:workflows", "read:executions"] }));
    expect(summary.scopeSummary).toContain("read:workflows");
    expect(summary.scopeSummary).toContain("read:executions");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createAuditEntry / getAuditEntriesForKey
// ─────────────────────────────────────────────────────────────────────────────

describe("createAuditEntry", () => {
  it("creates audit entry with correct fields", () => {
    const now = new Date("2025-06-01");
    const entry = createAuditEntry({ keyId: "k1", action: "created", performedBy: "admin", now });
    expect(entry.keyId).toBe("k1");
    expect(entry.action).toBe("created");
    expect(entry.performedBy).toBe("admin");
    expect(entry.timestamp).toEqual(now);
  });
});

describe("getAuditEntriesForKey", () => {
  const entries = [
    createAuditEntry({ keyId: "k1", action: "created", performedBy: "admin" }),
    createAuditEntry({ keyId: "k2", action: "used", performedBy: "user" }),
    createAuditEntry({ keyId: "k1", action: "used", performedBy: "user" }),
  ];

  it("filters entries by key id", () => {
    const filtered = getAuditEntriesForKey(entries, "k1");
    expect(filtered).toHaveLength(2);
    expect(filtered.every((e) => e.keyId === "k1")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getKeysExpiringWithin
// ─────────────────────────────────────────────────────────────────────────────

describe("getKeysExpiringWithin", () => {
  const now = new Date("2025-06-01");

  it("finds keys expiring in next 7 days", () => {
    const keys = [
      makeKey({ id: "k1", expiresAt: new Date("2025-06-05") }),  // 4 days
      makeKey({ id: "k2", expiresAt: new Date("2025-07-01") }),  // 30 days
      makeKey({ id: "k3", expiresAt: new Date("2025-06-03") }),  // 2 days
    ];
    const expiring = getKeysExpiringWithin(keys, 7, now);
    expect(expiring.map((k) => k.id)).toContain("k1");
    expect(expiring.map((k) => k.id)).toContain("k3");
    expect(expiring.map((k) => k.id)).not.toContain("k2");
  });

  it("excludes already-expired keys", () => {
    const keys = [
      makeKey({ id: "k1", expiresAt: new Date("2025-05-30") }),  // already expired
    ];
    const expiring = getKeysExpiringWithin(keys, 7, now);
    expect(expiring).toHaveLength(0);
  });

  it("excludes non-active keys", () => {
    const keys = [
      makeKey({ id: "k1", status: "revoked", expiresAt: new Date("2025-06-03") }),
    ];
    const expiring = getKeysExpiringWithin(keys, 7, now);
    expect(expiring).toHaveLength(0);
  });

  it("excludes keys with no expiry", () => {
    const keys = [makeKey({ id: "k1" })];
    const expiring = getKeysExpiringWithin(keys, 7, now);
    expect(expiring).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// summarizeKeys
// ─────────────────────────────────────────────────────────────────────────────

describe("summarizeKeys", () => {
  it("returns zeroes for empty list", () => {
    const s = summarizeKeys([]);
    expect(s.total).toBe(0);
    expect(s.active).toBe(0);
    expect(s.revoked).toBe(0);
  });

  it("counts by status", () => {
    const keys = [
      makeKey({ id: "k1", status: "active" }),
      makeKey({ id: "k2", status: "revoked" }),
      makeKey({ id: "k3", status: "active" }),
      makeKey({ id: "k4", status: "rotated" }),
    ];
    const s = summarizeKeys(keys);
    expect(s.active).toBe(2);
    expect(s.revoked).toBe(1);
    expect(s.rotated).toBe(1);
    expect(s.total).toBe(4);
  });

  it("counts by tier", () => {
    const keys = [
      makeKey({ id: "k1", tier: "personal" }),
      makeKey({ id: "k2", tier: "service" }),
      makeKey({ id: "k3", tier: "personal" }),
    ];
    const s = summarizeKeys(keys);
    expect(s.byTier.personal).toBe(2);
    expect(s.byTier.service).toBe(1);
    expect(s.byTier.admin).toBe(0);
  });
});
