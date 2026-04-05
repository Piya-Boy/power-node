import { describe, it, expect, beforeEach } from "vitest";
import {
  createShare,
  revokeShare,
  isShareActive,
  validateShare,
  hasCredentialAccess,
  getEffectivePermission,
  canPerformAction,
  getSharesForCredential,
  listCredentialsSharedWith,
  listSharesByOwner,
  findActiveShare,
  updateSharePermission,
  extendShareExpiry,
  revokeAllShares,
  computeSharingStats,
  describeShare,
  resetShareIdSeq,
  type SharedCredential,
} from "./credential-sharing";

beforeEach(() => resetShareIdSeq());

// ─── createShare ───────────────────────────────────────────────────────────────

describe("createShare", () => {
  it("creates a share with correct fields", () => {
    const s = createShare("cred_1", "owner_1", "user_2", "use");
    expect(s.credentialId).toBe("cred_1");
    expect(s.ownerId).toBe("owner_1");
    expect(s.targetUserId).toBe("user_2");
    expect(s.permission).toBe("use");
    expect(s.id).toMatch(/^share_/);
    expect(s.sharedAt).toBeInstanceOf(Date);
    expect(s.revokedAt).toBeUndefined();
    expect(s.expiresAt).toBeUndefined();
  });

  it("accepts optional expiresAt and note", () => {
    const exp = new Date(Date.now() + 86400_000);
    const s = createShare("cred_1", "owner_1", "user_2", "view", {
      expiresAt: exp,
      note: "Temp access",
    });
    expect(s.expiresAt).toEqual(exp);
    expect(s.note).toBe("Temp access");
  });

  it("increments IDs", () => {
    const a = createShare("c", "o", "u", "use");
    const b = createShare("c", "o", "u2", "view");
    expect(b.id).not.toBe(a.id);
  });
});

// ─── revokeShare ─────────────────────────────────────────────────────────────

describe("revokeShare", () => {
  it("sets revokedAt", () => {
    const s = createShare("c", "o", "u", "use");
    const revoked = revokeShare(s);
    expect(revoked.revokedAt).toBeInstanceOf(Date);
  });

  it("is immutable — original unchanged", () => {
    const s = createShare("c", "o", "u", "use");
    revokeShare(s);
    expect(s.revokedAt).toBeUndefined();
  });
});

// ─── isShareActive ────────────────────────────────────────────────────────────

describe("isShareActive", () => {
  it("active share returns true", () => {
    const s = createShare("c", "o", "u", "use");
    expect(isShareActive(s)).toBe(true);
  });

  it("revoked share returns false", () => {
    const s = revokeShare(createShare("c", "o", "u", "use"));
    expect(isShareActive(s)).toBe(false);
  });

  it("expired share returns false", () => {
    const s = createShare("c", "o", "u", "use", {
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(isShareActive(s)).toBe(false);
  });

  it("future expiry is still active", () => {
    const s = createShare("c", "o", "u", "use", {
      expiresAt: new Date(Date.now() + 86400_000),
    });
    expect(isShareActive(s)).toBe(true);
  });
});

// ─── validateShare ────────────────────────────────────────────────────────────

describe("validateShare", () => {
  it("valid share passes", () => {
    const r = validateShare("cred_1", "owner", "user", "use");
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("empty credentialId fails", () => {
    const r = validateShare("", "owner", "user", "use");
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("credentialId is required");
  });

  it("same owner and target fails", () => {
    const r = validateShare("c", "same", "same", "use");
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("Cannot share credential with yourself");
  });

  it("invalid permission fails", () => {
    const r = validateShare("c", "o", "u", "admin" as never);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("Invalid permission"))).toBe(true);
  });
});

// ─── hasCredentialAccess ──────────────────────────────────────────────────────

describe("hasCredentialAccess", () => {
  it("owner always has access", () => {
    expect(hasCredentialAccess([], "c", "owner", "owner")).toBe(true);
  });

  it("user with active share has access", () => {
    const s = createShare("c", "owner", "user", "view");
    expect(hasCredentialAccess([s], "c", "user", "owner")).toBe(true);
  });

  it("user without share has no access", () => {
    expect(hasCredentialAccess([], "c", "other", "owner")).toBe(false);
  });

  it("revoked share removes access", () => {
    const s = revokeShare(createShare("c", "owner", "user", "use"));
    expect(hasCredentialAccess([s], "c", "user", "owner")).toBe(false);
  });
});

// ─── getEffectivePermission ───────────────────────────────────────────────────

describe("getEffectivePermission", () => {
  it("owner gets manage", () => {
    expect(getEffectivePermission([], "c", "owner", "owner")).toBe("manage");
  });

  it("returns permission from share", () => {
    const s = createShare("c", "owner", "user", "view");
    expect(getEffectivePermission([s], "c", "user", "owner")).toBe("view");
  });

  it("returns null when no access", () => {
    expect(getEffectivePermission([], "c", "user", "owner")).toBeNull();
  });

  it("returns highest permission when multiple shares", () => {
    const s1 = createShare("c", "o", "u", "use");
    const s2 = createShare("c", "o", "u", "manage");
    expect(getEffectivePermission([s1, s2], "c", "u", "o")).toBe("manage");
  });
});

// ─── canPerformAction ─────────────────────────────────────────────────────────

describe("canPerformAction", () => {
  it("owner can manage", () => {
    expect(canPerformAction([], "c", "owner", "owner", "manage")).toBe(true);
  });

  it("use permission cannot view or manage", () => {
    const s = createShare("c", "o", "u", "use");
    expect(canPerformAction([s], "c", "u", "o", "use")).toBe(true);
    expect(canPerformAction([s], "c", "u", "o", "view")).toBe(false);
  });

  it("manage permission satisfies all", () => {
    const s = createShare("c", "o", "u", "manage");
    expect(canPerformAction([s], "c", "u", "o", "use")).toBe(true);
    expect(canPerformAction([s], "c", "u", "o", "view")).toBe(true);
    expect(canPerformAction([s], "c", "u", "o", "manage")).toBe(true);
  });
});

// ─── getSharesForCredential ───────────────────────────────────────────────────

describe("getSharesForCredential", () => {
  it("returns share entries for credential", () => {
    const s1 = createShare("c1", "o", "u1", "use");
    const s2 = createShare("c2", "o", "u2", "view");
    const entries = getSharesForCredential([s1, s2], "c1");
    expect(entries).toHaveLength(1);
    expect(entries[0].targetUserId).toBe("u1");
  });

  it("marks revoked shares as inactive", () => {
    const s = revokeShare(createShare("c1", "o", "u", "use"));
    const entries = getSharesForCredential([s], "c1");
    expect(entries[0].isActive).toBe(false);
  });
});

// ─── listCredentialsSharedWith ────────────────────────────────────────────────

describe("listCredentialsSharedWith", () => {
  it("returns active shares for target user", () => {
    const s1 = createShare("c1", "o", "u", "use");
    const s2 = revokeShare(createShare("c2", "o", "u", "view"));
    const results = listCredentialsSharedWith([s1, s2], "u");
    expect(results).toHaveLength(1);
    expect(results[0].credentialId).toBe("c1");
  });

  it("includes revoked when activeOnly=false", () => {
    const s1 = createShare("c1", "o", "u", "use");
    const s2 = revokeShare(createShare("c2", "o", "u", "view"));
    expect(listCredentialsSharedWith([s1, s2], "u", false)).toHaveLength(2);
  });
});

// ─── listSharesByOwner ────────────────────────────────────────────────────────

describe("listSharesByOwner", () => {
  it("returns owner's active shares", () => {
    const s1 = createShare("c1", "owner", "u1", "use");
    const s2 = createShare("c2", "other", "u2", "view");
    const results = listSharesByOwner([s1, s2], "owner");
    expect(results).toHaveLength(1);
    expect(results[0].credentialId).toBe("c1");
  });
});

// ─── findActiveShare ──────────────────────────────────────────────────────────

describe("findActiveShare", () => {
  it("finds matching active share", () => {
    const s = createShare("c", "o", "u", "use");
    expect(findActiveShare([s], "c", "u")).toEqual(s);
  });

  it("returns undefined for revoked", () => {
    const s = revokeShare(createShare("c", "o", "u", "use"));
    expect(findActiveShare([s], "c", "u")).toBeUndefined();
  });
});

// ─── updateSharePermission ────────────────────────────────────────────────────

describe("updateSharePermission", () => {
  it("updates permission immutably", () => {
    const s = createShare("c", "o", "u", "use");
    const updated = updateSharePermission(s, "view");
    expect(updated.permission).toBe("view");
    expect(s.permission).toBe("use");
  });
});

// ─── extendShareExpiry ────────────────────────────────────────────────────────

describe("extendShareExpiry", () => {
  it("updates expiresAt", () => {
    const s = createShare("c", "o", "u", "use");
    const newExpiry = new Date(Date.now() + 86400_000 * 7);
    const updated = extendShareExpiry(s, newExpiry);
    expect(updated.expiresAt).toEqual(newExpiry);
  });
});

// ─── revokeAllShares ──────────────────────────────────────────────────────────

describe("revokeAllShares", () => {
  it("revokes all active shares for a credential", () => {
    const s1 = createShare("c1", "o", "u1", "use");
    const s2 = createShare("c1", "o", "u2", "view");
    const s3 = createShare("c2", "o", "u3", "use");
    const result = revokeAllShares([s1, s2, s3], "c1");
    expect(result.filter((s) => s.credentialId === "c1").every((s) => s.revokedAt)).toBe(true);
    expect(result.find((s) => s.credentialId === "c2")!.revokedAt).toBeUndefined();
  });
});

// ─── computeSharingStats ──────────────────────────────────────────────────────

describe("computeSharingStats", () => {
  it("returns zero stats for empty array", () => {
    const stats = computeSharingStats([]);
    expect(stats.totalShares).toBe(0);
    expect(stats.activeShares).toBe(0);
  });

  it("counts active, expired, revoked", () => {
    const active = createShare("c1", "o", "u1", "use");
    const revoked = revokeShare(createShare("c1", "o", "u2", "view"));
    const expired = createShare("c2", "o", "u3", "manage", {
      expiresAt: new Date(Date.now() - 1000),
    });
    const stats = computeSharingStats([active, revoked, expired]);
    expect(stats.activeShares).toBe(1);
    expect(stats.revokedShares).toBe(1);
    expect(stats.expiredShares).toBe(1);
  });

  it("counts by permission", () => {
    const s1 = createShare("c", "o", "u1", "use");
    const s2 = createShare("c", "o", "u2", "view");
    const s3 = createShare("c", "o", "u3", "manage");
    const stats = computeSharingStats([s1, s2, s3]);
    expect(stats.byPermission.use).toBe(1);
    expect(stats.byPermission.view).toBe(1);
    expect(stats.byPermission.manage).toBe(1);
  });

  it("lists most shared credentials", () => {
    const shares: SharedCredential[] = [
      createShare("cred_a", "o", "u1", "use"),
      createShare("cred_a", "o", "u2", "use"),
      createShare("cred_b", "o", "u3", "use"),
    ];
    const stats = computeSharingStats(shares);
    expect(stats.mostSharedCredentials[0].credentialId).toBe("cred_a");
    expect(stats.mostSharedCredentials[0].shareCount).toBe(2);
  });
});

// ─── describeShare ────────────────────────────────────────────────────────────

describe("describeShare", () => {
  it("describes an active share", () => {
    const s = createShare("cred_1", "o", "user_2", "view");
    const desc = describeShare(s);
    expect(desc).toContain("cred_1");
    expect(desc).toContain("user_2");
    expect(desc).toContain("view");
    expect(desc).toContain("active");
  });

  it("describes a revoked share", () => {
    const s = revokeShare(createShare("c", "o", "u", "use"));
    expect(describeShare(s)).toContain("revoked");
  });
});
