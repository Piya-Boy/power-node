import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_POLICIES,
  createSecret,
  scheduleRotation,
  beginRotation,
  completeRotation,
  failRotation,
  revokeSecret,
  isExpired,
  isExpiringSoon,
  daysUntilExpiry,
  isRotationDue,
  getActiveVersion,
  getExpiredSecrets,
  getExpiringSoonSecrets,
  getOverdueRotations,
  getFailedRotations,
  getSecretsByType,
  getSecretsByStatus,
  updatePolicy,
  validatePolicy,
  getRotationHistory,
  getSuccessfulRotations,
  getFailedRotationEvents,
  getRotationSuccessRate,
  computeRotationStats,
  summarizeSecret,
  resetIdSeq,
  type ManagedSecret,
  type RotationEvent,
} from "./secrets-rotation";

const NOW = 1_700_000_000_000;
const DAY_MS = 86_400_000;

beforeEach(() => {
  resetIdSeq();
});

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT_POLICIES
// ─────────────────────────────────────────────────────────────────────────────

describe("DEFAULT_POLICIES", () => {
  it("api_key has 90-day interval", () => {
    expect(DEFAULT_POLICIES.api_key.intervalDays).toBe(90);
  });

  it("oauth_token has autoRotate=true", () => {
    expect(DEFAULT_POLICIES.oauth_token.autoRotate).toBe(true);
  });

  it("certificate has 365-day interval", () => {
    expect(DEFAULT_POLICIES.certificate.intervalDays).toBe(365);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createSecret
// ─────────────────────────────────────────────────────────────────────────────

describe("createSecret", () => {
  it("creates secret with defaults", () => {
    const s = createSecret("s1", "My API Key", "api_key", NOW);
    expect(s.id).toBe("s1");
    expect(s.name).toBe("My API Key");
    expect(s.type).toBe("api_key");
    expect(s.status).toBe("active");
    expect(s.currentVersion).toBe(1);
    expect(s.versions).toHaveLength(1);
    expect(s.versions[0].isActive).toBe(true);
    expect(s.versions[0].version).toBe(1);
  });

  it("sets nextRotationAt based on policy interval", () => {
    const s = createSecret("s1", "Key", "api_key", NOW);
    expect(s.nextRotationAt).toBe(NOW + 90 * DAY_MS);
  });

  it("allows policy overrides", () => {
    const s = createSecret("s1", "Key", "api_key", NOW, { intervalDays: 30 });
    expect(s.policy.intervalDays).toBe(30);
  });

  it("version has checksum", () => {
    const s = createSecret("s1", "Key", "api_key", NOW);
    expect(s.versions[0].checksum).toMatch(/^sha256:/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rotation Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

describe("scheduleRotation", () => {
  it("sets status to pending_rotation", () => {
    const s = createSecret("s1", "Key", "api_key", NOW);
    expect(scheduleRotation(s, NOW).status).toBe("pending_rotation");
  });
});

describe("beginRotation", () => {
  it("sets status to rotating", () => {
    const s = createSecret("s1", "Key", "api_key", NOW);
    expect(beginRotation(s, NOW).status).toBe("rotating");
  });
});

describe("completeRotation", () => {
  it("increments version", () => {
    const s = createSecret("s1", "Key", "api_key", NOW);
    const { secret } = completeRotation(s, NOW + DAY_MS);
    expect(secret.currentVersion).toBe(2);
  });

  it("sets status back to active", () => {
    const s = createSecret("s1", "Key", "api_key", NOW);
    const { secret } = completeRotation(s, NOW + DAY_MS);
    expect(secret.status).toBe("active");
  });

  it("deactivates old version", () => {
    const s = createSecret("s1", "Key", "api_key", NOW);
    const { secret } = completeRotation(s, NOW + DAY_MS);
    const v1 = secret.versions.find((v) => v.version === 1);
    expect(v1?.isActive).toBe(false);
  });

  it("adds new active version", () => {
    const s = createSecret("s1", "Key", "api_key", NOW);
    const { secret } = completeRotation(s, NOW + DAY_MS);
    const v2 = secret.versions.find((v) => v.version === 2);
    expect(v2?.isActive).toBe(true);
  });

  it("creates rotation event", () => {
    const s = createSecret("s1", "Key", "api_key", NOW);
    const { event } = completeRotation(s, NOW + DAY_MS);
    expect(event.success).toBe(true);
    expect(event.fromVersion).toBe(1);
    expect(event.toVersion).toBe(2);
    expect(event.secretId).toBe("s1");
  });

  it("updates lastRotatedAt and nextRotationAt", () => {
    const s = createSecret("s1", "Key", "api_key", NOW);
    const rotTime = NOW + DAY_MS;
    const { secret } = completeRotation(s, rotTime);
    expect(secret.lastRotatedAt).toBe(rotTime);
    expect(secret.nextRotationAt).toBe(rotTime + 90 * DAY_MS);
  });

  it("prunes old versions beyond retainVersions", () => {
    let s = createSecret("s1", "Key", "api_key", NOW, { retainVersions: 2 });
    s = completeRotation(s, NOW + DAY_MS).secret;
    s = completeRotation(s, NOW + 2 * DAY_MS).secret;
    s = completeRotation(s, NOW + 3 * DAY_MS).secret;
    // retainVersions=2, plus active = at most 3 versions, but we prune to retainVersions+1
    expect(s.versions.length).toBeLessThanOrEqual(3);
  });
});

describe("failRotation", () => {
  it("sets status to failed", () => {
    const s = createSecret("s1", "Key", "api_key", NOW);
    const { secret } = failRotation(s, "Connection error", NOW);
    expect(secret.status).toBe("failed");
  });

  it("creates failure event", () => {
    const s = createSecret("s1", "Key", "api_key", NOW);
    const { event } = failRotation(s, "Timeout", NOW);
    expect(event.success).toBe(false);
    expect(event.errorMessage).toBe("Timeout");
  });

  it("does not change version", () => {
    const s = createSecret("s1", "Key", "api_key", NOW);
    const { secret } = failRotation(s, "Error", NOW);
    expect(secret.currentVersion).toBe(1);
  });
});

describe("revokeSecret", () => {
  it("sets status to revoked", () => {
    const s = createSecret("s1", "Key", "api_key", NOW);
    expect(revokeSecret(s, NOW).status).toBe("revoked");
  });

  it("deactivates all versions", () => {
    const s = createSecret("s1", "Key", "api_key", NOW);
    const revoked = revokeSecret(s, NOW);
    expect(revoked.versions.every((v) => !v.isActive)).toBe(true);
    expect(revoked.versions[0].revokedAt).toBe(NOW);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Status Checks
// ─────────────────────────────────────────────────────────────────────────────

describe("isExpired", () => {
  it("false when not expired", () => {
    const s = createSecret("s1", "Key", "api_key", NOW);
    expect(isExpired(s, NOW + DAY_MS)).toBe(false);
  });

  it("true after expiry", () => {
    const s = createSecret("s1", "Key", "api_key", NOW);
    expect(isExpired(s, NOW + 91 * DAY_MS)).toBe(true);
  });
});

describe("isExpiringSoon", () => {
  it("true within warn window", () => {
    const s = createSecret("s1", "Key", "api_key", NOW);
    // api_key: 90 day interval, 14 day warn
    // Expiry = NOW + 90d
    // Warn start = NOW + 90d - 14d = NOW + 76d
    expect(isExpiringSoon(s, NOW + 77 * DAY_MS)).toBe(true);
  });

  it("false before warn window", () => {
    const s = createSecret("s1", "Key", "api_key", NOW);
    expect(isExpiringSoon(s, NOW + 70 * DAY_MS)).toBe(false);
  });

  it("false after expiry", () => {
    const s = createSecret("s1", "Key", "api_key", NOW);
    expect(isExpiringSoon(s, NOW + 91 * DAY_MS)).toBe(false);
  });
});

describe("daysUntilExpiry", () => {
  it("returns days remaining", () => {
    const s = createSecret("s1", "Key", "api_key", NOW);
    expect(daysUntilExpiry(s, NOW)).toBe(90);
  });

  it("returns 0 when expired", () => {
    const s = createSecret("s1", "Key", "api_key", NOW);
    expect(daysUntilExpiry(s, NOW + 100 * DAY_MS)).toBe(0);
  });
});

describe("isRotationDue", () => {
  it("false before rotation time", () => {
    const s = createSecret("s1", "Key", "api_key", NOW);
    expect(isRotationDue(s, NOW + DAY_MS)).toBe(false);
  });

  it("true at or after rotation time", () => {
    const s = createSecret("s1", "Key", "api_key", NOW);
    expect(isRotationDue(s, NOW + 90 * DAY_MS)).toBe(true);
  });
});

describe("getActiveVersion", () => {
  it("returns active version", () => {
    const s = createSecret("s1", "Key", "api_key", NOW);
    expect(getActiveVersion(s)?.version).toBe(1);
  });

  it("returns new active after rotation", () => {
    const s = createSecret("s1", "Key", "api_key", NOW);
    const { secret } = completeRotation(s, NOW + DAY_MS);
    expect(getActiveVersion(secret)?.version).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bulk Queries
// ─────────────────────────────────────────────────────────────────────────────

function makeSecrets(): ManagedSecret[] {
  return [
    createSecret("s1", "API Key", "api_key", NOW),
    createSecret("s2", "OAuth", "oauth_token", NOW - 100 * DAY_MS), // created 100 days ago, interval=30
    createSecret("s3", "DB Pass", "database_password", NOW, { intervalDays: 1 }), // expires tomorrow
    failRotation(createSecret("s4", "Webhook", "webhook_secret", NOW), "Error", NOW).secret,
  ];
}

describe("getExpiredSecrets", () => {
  it("finds secrets past expiry", () => {
    const secrets = makeSecrets();
    // s2 was created 100 days ago with 30-day interval → expired
    const expired = getExpiredSecrets(secrets, NOW);
    expect(expired.some((s) => s.id === "s2")).toBe(true);
  });
});

describe("getExpiringSoonSecrets", () => {
  it("finds secrets in warning window", () => {
    const s = createSecret("s1", "Key", "api_key", NOW);
    // Move time to 80 days in (14-day warn, expiry at 90d)
    expect(getExpiringSoonSecrets([s], NOW + 80 * DAY_MS)).toHaveLength(1);
  });
});

describe("getOverdueRotations", () => {
  it("finds active secrets past rotation time", () => {
    const s = createSecret("s1", "Key", "api_key", NOW);
    expect(getOverdueRotations([s], NOW + 91 * DAY_MS)).toHaveLength(1);
  });
});

describe("getFailedRotations", () => {
  it("returns secrets with failed status", () => {
    expect(getFailedRotations(makeSecrets())).toHaveLength(1);
  });
});

describe("getSecretsByType", () => {
  it("filters by type", () => {
    expect(getSecretsByType(makeSecrets(), "api_key")).toHaveLength(1);
  });
});

describe("getSecretsByStatus", () => {
  it("filters by status", () => {
    expect(getSecretsByStatus(makeSecrets(), "failed")).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Policy Utilities
// ─────────────────────────────────────────────────────────────────────────────

describe("updatePolicy", () => {
  it("updates policy fields", () => {
    const s = createSecret("s1", "Key", "api_key", NOW);
    const updated = updatePolicy(s, { intervalDays: 30 }, NOW);
    expect(updated.policy.intervalDays).toBe(30);
  });
});

describe("validatePolicy", () => {
  it("passes valid policy", () => {
    expect(validatePolicy(DEFAULT_POLICIES.api_key)).toHaveLength(0);
  });

  it("errors on non-positive interval", () => {
    expect(validatePolicy({ ...DEFAULT_POLICIES.api_key, intervalDays: 0 }).length).toBeGreaterThan(0);
  });

  it("errors when warn >= interval", () => {
    expect(validatePolicy({ ...DEFAULT_POLICIES.api_key, warnDaysBeforeExpiry: 90, intervalDays: 90 }).length).toBeGreaterThan(0);
  });

  it("errors on retainVersions < 1", () => {
    expect(validatePolicy({ ...DEFAULT_POLICIES.api_key, retainVersions: 0 }).length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Rotation History
// ─────────────────────────────────────────────────────────────────────────────

describe("getRotationHistory", () => {
  it("returns events for a specific secret", () => {
    const events: RotationEvent[] = [
      { id: "e1", secretId: "s1", trigger: "scheduled", fromVersion: 1, toVersion: 2, performedAt: NOW, success: true },
      { id: "e2", secretId: "s2", trigger: "manual", fromVersion: 1, toVersion: 2, performedAt: NOW, success: true },
    ];
    expect(getRotationHistory(events, "s1")).toHaveLength(1);
  });
});

describe("getRotationSuccessRate", () => {
  it("computes success rate", () => {
    const events: RotationEvent[] = [
      { id: "e1", secretId: "s1", trigger: "scheduled", fromVersion: 1, toVersion: 2, performedAt: NOW, success: true },
      { id: "e2", secretId: "s1", trigger: "scheduled", fromVersion: 2, toVersion: 3, performedAt: NOW, success: false },
    ];
    expect(getRotationSuccessRate(events)).toBe(0.5);
  });

  it("returns 0 for empty", () => {
    expect(getRotationSuccessRate([])).toBe(0);
  });
});

describe("getSuccessfulRotations / getFailedRotationEvents", () => {
  const events: RotationEvent[] = [
    { id: "e1", secretId: "s1", trigger: "scheduled", fromVersion: 1, toVersion: 2, performedAt: NOW, success: true },
    { id: "e2", secretId: "s1", trigger: "scheduled", fromVersion: 2, toVersion: 3, performedAt: NOW, success: false },
  ];

  it("getSuccessfulRotations", () => expect(getSuccessfulRotations(events)).toHaveLength(1));
  it("getFailedRotationEvents", () => expect(getFailedRotationEvents(events)).toHaveLength(1));
});

// ─────────────────────────────────────────────────────────────────────────────
// Stats & Summary
// ─────────────────────────────────────────────────────────────────────────────

describe("computeRotationStats", () => {
  it("counts totals", () => {
    const stats = computeRotationStats(makeSecrets(), NOW);
    expect(stats.total).toBe(4);
    expect(stats.failed).toBe(1);
  });

  it("counts by type", () => {
    const stats = computeRotationStats(makeSecrets(), NOW);
    expect(stats.byType.api_key).toBe(1);
    expect(stats.byType.oauth_token).toBe(1);
  });
});

describe("summarizeSecret", () => {
  it("summarizes active secret", () => {
    const s = createSecret("s1", "My Key", "api_key", NOW);
    const summary = summarizeSecret(s, NOW);
    expect(summary).toContain("ACTIVE");
    expect(summary).toContain("My Key");
    expect(summary).toContain("api_key");
    expect(summary).toContain("v1");
    expect(summary).toContain("90d");
  });
});
