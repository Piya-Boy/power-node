import { describe, it, expect } from "vitest";
import {
  encodePayload,
  decodePayload,
  validateEncryptedPayload,
  maskCredential,
  maskCredentialMap,
  detectCredentialType,
  generateKeyId,
  createKeyRotationPlan,
  updateRotationProgress,
  completeRotation,
  failRotation,
  isRotationComplete,
  getRotationProgressPercent,
  createVault,
  validateVaultName,
  summarizeVaults,
  type EncryptedPayload,
  type CredentialVault,
} from "./credential-encryption";

// ─── encodePayload / decodePayload ───────────────────────────────────────────

describe("encodePayload / decodePayload", () => {
  const payload: EncryptedPayload = {
    algorithm: "aes-256-gcm",
    iv: "aabbccdd11223344",
    ciphertext: "SGVsbG8gV29ybGQ=",
    authTag: "deadbeef01020304",
    version: 1,
  };

  it("encodes to a non-empty base64 string", () => {
    const encoded = encodePayload(payload);
    expect(typeof encoded).toBe("string");
    expect(encoded.length).toBeGreaterThan(0);
    // valid base64
    expect(() => Buffer.from(encoded, "base64")).not.toThrow();
  });

  it("round-trips payload correctly", () => {
    const encoded = encodePayload(payload);
    const decoded = decodePayload(encoded);
    expect(decoded).toEqual(payload);
  });

  it("includes optional fields after round-trip", () => {
    const p: EncryptedPayload = {
      ...payload,
      salt: "saltsalt",
      kdf: "pbkdf2",
      keyId: "key_abcdef1234567890",
    };
    const decoded = decodePayload(encodePayload(p));
    expect(decoded?.salt).toBe("saltsalt");
    expect(decoded?.kdf).toBe("pbkdf2");
    expect(decoded?.keyId).toBe("key_abcdef1234567890");
  });

  it("decodePayload returns null for invalid base64 JSON", () => {
    expect(decodePayload("not-valid!!!")).toBeNull();
  });

  it("decodePayload returns null for valid base64 but non-JSON content", () => {
    const encoded = Buffer.from("hello world").toString("base64");
    expect(decodePayload(encoded)).toBeNull();
  });

  it("decodePayload returns null for empty string", () => {
    expect(decodePayload("")).toBeNull();
  });
});

// ─── validateEncryptedPayload ────────────────────────────────────────────────

describe("validateEncryptedPayload", () => {
  const valid: EncryptedPayload = {
    algorithm: "aes-256-gcm",
    iv: "aabbccdd11223344",
    ciphertext: "SGVsbG8=",
    authTag: "deadbeef01020304",
    version: 1,
  };

  it("passes for a valid GCM payload", () => {
    const result = validateEncryptedPayload(valid);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("passes for aes-256-cbc (no authTag required)", () => {
    const result = validateEncryptedPayload({
      algorithm: "aes-256-cbc",
      iv: "aabbccdd11223344",
      ciphertext: "SGVsbG8=",
      version: 1,
    });
    expect(result.valid).toBe(true);
  });

  it("fails for unknown algorithm", () => {
    const result = validateEncryptedPayload({
      ...(valid as unknown as EncryptedPayload),
      algorithm: "des-3" as never,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("algorithm"))).toBe(true);
  });

  it("fails when iv is empty", () => {
    const result = validateEncryptedPayload({ ...valid, iv: "" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes("iv"))).toBe(true);
  });

  it("fails when iv is not hex", () => {
    const result = validateEncryptedPayload({ ...valid, iv: "not-hex!!" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("hex"))).toBe(true);
  });

  it("fails when ciphertext is empty", () => {
    const result = validateEncryptedPayload({ ...valid, ciphertext: "" });
    expect(result.valid).toBe(false);
  });

  it("fails when version is 0", () => {
    const result = validateEncryptedPayload({ ...valid, version: 0 });
    expect(result.valid).toBe(false);
  });

  it("fails when version is non-integer", () => {
    const result = validateEncryptedPayload({ ...valid, version: 1.5 });
    expect(result.valid).toBe(false);
  });

  it("fails when kdf is invalid", () => {
    const result = validateEncryptedPayload({
      ...valid,
      kdf: "bcrypt" as never,
      salt: "abc",
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("kdf"))).toBe(true);
  });

  it("fails when kdf is present but salt is missing", () => {
    const result = validateEncryptedPayload({ ...valid, kdf: "pbkdf2" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("salt"))).toBe(true);
  });

  it("fails for GCM without authTag", () => {
    const { authTag: _, ...withoutTag } = valid;
    const result = validateEncryptedPayload(withoutTag as EncryptedPayload);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("authTag"))).toBe(true);
  });

  it("fails for chacha20-poly1305 without authTag", () => {
    const result = validateEncryptedPayload({
      algorithm: "chacha20-poly1305",
      iv: "aabbccdd11223344",
      ciphertext: "SGVsbG8=",
      version: 1,
    });
    expect(result.valid).toBe(false);
  });

  it("passes with kdf + salt together", () => {
    const result = validateEncryptedPayload({
      ...valid,
      kdf: "scrypt",
      salt: "saltvalue",
    });
    expect(result.valid).toBe(true);
  });
});

// ─── maskCredential ──────────────────────────────────────────────────────────

describe("maskCredential", () => {
  it("masks the middle of a long credential", () => {
    const result = maskCredential("sk-abcdefghijklmnop");
    expect(result).toMatch(/^sk-a\*\*\*mnop$/);
  });

  it("uses custom visibleChars", () => {
    const result = maskCredential("abcdefghijklmnopqrstuvwxyz", 2);
    expect(result.startsWith("ab")).toBe(true);
    expect(result.endsWith("yz")).toBe(true);
    expect(result).toContain("***");
  });

  it("masks entire short string when too short to show ends", () => {
    const result = maskCredential("abc", 4);
    expect(result).toBe("***");
  });

  it("returns *** for empty string", () => {
    expect(maskCredential("")).toBe("***");
  });

  it("returns *** for exactly visibleChars * 2 chars", () => {
    const result = maskCredential("12345678", 4);
    expect(result).toBe("********");
  });
});

// ─── maskCredentialMap ───────────────────────────────────────────────────────

describe("maskCredentialMap", () => {
  it("masks all values in a map", () => {
    const result = maskCredentialMap({
      apiKey: "sk-abcdefghijklmnop",
      secret: "supersecretvalue123",
    });
    expect(result.apiKey).toContain("***");
    expect(result.secret).toContain("***");
  });

  it("preserves keys", () => {
    const result = maskCredentialMap({ TOKEN: "abcdefghijklmnopqrst" });
    expect(Object.keys(result)).toContain("TOKEN");
  });

  it("handles empty map", () => {
    expect(maskCredentialMap({})).toEqual({});
  });
});

// ─── detectCredentialType ────────────────────────────────────────────────────

describe("detectCredentialType", () => {
  it("detects JWT", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    expect(detectCredentialType(jwt)).toBe("jwt");
  });

  it("detects Basic Auth", () => {
    expect(detectCredentialType("Basic dXNlcjpwYXNz")).toBe("basic-auth");
  });

  it("detects Bearer token", () => {
    expect(detectCredentialType("Bearer mytoken123")).toBe("bearer");
  });

  it("detects Google OAuth token", () => {
    expect(detectCredentialType("ya29.A0ARrdaM-abc123XYZ")).toBe("oauth-token");
  });

  it("detects sk- prefixed API key", () => {
    expect(detectCredentialType("sk-abcdef1234567890abcdef")).toBe("api-key");
  });

  it("detects pk_ prefixed API key", () => {
    expect(detectCredentialType("pk_live_abcdef1234567890")).toBe("api-key");
  });

  it("detects long alphanumeric as api-key", () => {
    expect(detectCredentialType("abcdefghijklmnopqrstuvwxyz123456")).toBe("api-key");
  });

  it("returns unknown for short random string", () => {
    expect(detectCredentialType("short")).toBe("unknown");
  });

  it("returns unknown for empty string", () => {
    expect(detectCredentialType("")).toBe("unknown");
  });
});

// ─── generateKeyId ───────────────────────────────────────────────────────────

describe("generateKeyId", () => {
  it("returns a string starting with key_", () => {
    expect(generateKeyId().startsWith("key_")).toBe(true);
  });

  it("has 16 hex chars after key_", () => {
    const id = generateKeyId();
    const hex = id.slice(4);
    expect(hex).toHaveLength(16);
    expect(/^[0-9a-f]{16}$/.test(hex)).toBe(true);
  });

  it("generates unique ids", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateKeyId()));
    expect(ids.size).toBeGreaterThan(90);
  });
});

// ─── Key Rotation Plan ───────────────────────────────────────────────────────

describe("createKeyRotationPlan", () => {
  it("creates a plan with pending status", () => {
    const plan = createKeyRotationPlan("vault1", "old-key", "new-key", 50);
    expect(plan.vaultId).toBe("vault1");
    expect(plan.oldKeyId).toBe("old-key");
    expect(plan.newKeyId).toBe("new-key");
    expect(plan.entriesTotal).toBe(50);
    expect(plan.entriesMigrated).toBe(0);
    expect(plan.status).toBe("pending");
    expect(plan.completedAt).toBeUndefined();
  });

  it("sets startedAt to current time", () => {
    const before = new Date();
    const plan = createKeyRotationPlan("v", "o", "n", 10);
    const after = new Date();
    expect(plan.startedAt >= before).toBe(true);
    expect(plan.startedAt <= after).toBe(true);
  });
});

describe("updateRotationProgress", () => {
  it("updates migrated count and sets in-progress", () => {
    const plan = createKeyRotationPlan("vault1", "old", "new", 100);
    const updated = updateRotationProgress(plan, 30);
    expect(updated.entriesMigrated).toBe(30);
    expect(updated.status).toBe("in-progress");
  });

  it("does not mutate original plan", () => {
    const plan = createKeyRotationPlan("vault1", "old", "new", 100);
    updateRotationProgress(plan, 30);
    expect(plan.entriesMigrated).toBe(0);
  });
});

describe("completeRotation", () => {
  it("sets status to completed", () => {
    const plan = createKeyRotationPlan("vault1", "old", "new", 50);
    const done = completeRotation(plan);
    expect(done.status).toBe("completed");
    expect(done.completedAt).toBeInstanceOf(Date);
    expect(done.entriesMigrated).toBe(50);
  });
});

describe("failRotation", () => {
  it("sets status to failed with reason", () => {
    const plan = createKeyRotationPlan("vault1", "old", "new", 50);
    const failed = failRotation(plan, "network error");
    expect(failed.status).toBe("failed");
    expect(failed.failureReason).toBe("network error");
    expect(failed.completedAt).toBeInstanceOf(Date);
  });
});

describe("isRotationComplete", () => {
  it("returns true only for completed status", () => {
    const plan = createKeyRotationPlan("v", "o", "n", 10);
    expect(isRotationComplete(plan)).toBe(false);
    expect(isRotationComplete(updateRotationProgress(plan, 5))).toBe(false);
    expect(isRotationComplete(completeRotation(plan))).toBe(true);
    expect(isRotationComplete(failRotation(plan, "err"))).toBe(false);
  });
});

describe("getRotationProgressPercent", () => {
  it("returns 0 at start", () => {
    const plan = createKeyRotationPlan("v", "o", "n", 100);
    expect(getRotationProgressPercent(plan)).toBe(0);
  });

  it("returns 50 at half", () => {
    const plan = updateRotationProgress(
      createKeyRotationPlan("v", "o", "n", 100),
      50
    );
    expect(getRotationProgressPercent(plan)).toBe(50);
  });

  it("returns 100 when complete", () => {
    const plan = completeRotation(createKeyRotationPlan("v", "o", "n", 100));
    expect(getRotationProgressPercent(plan)).toBe(100);
  });

  it("returns 100 when entriesTotal is 0", () => {
    const plan = createKeyRotationPlan("v", "o", "n", 0);
    expect(getRotationProgressPercent(plan)).toBe(100);
  });
});

// ─── createVault ─────────────────────────────────────────────────────────────

describe("createVault", () => {
  it("creates a vault with defaults", () => {
    const vault = createVault({ id: "v1", name: "my-vault" });
    expect(vault.id).toBe("v1");
    expect(vault.name).toBe("my-vault");
    expect(vault.algorithm).toBe("aes-256-gcm");
    expect(vault.keyId).toMatch(/^key_[0-9a-f]{16}$/);
    expect(vault.entriesCount).toBe(0);
    expect(vault.createdAt).toBeInstanceOf(Date);
    expect(vault.rotatedAt).toBeUndefined();
  });

  it("accepts custom algorithm and keyId", () => {
    const vault = createVault({
      id: "v2",
      name: "cbc-vault",
      algorithm: "aes-256-cbc",
      keyId: "key_custom",
      entriesCount: 5,
    });
    expect(vault.algorithm).toBe("aes-256-cbc");
    expect(vault.keyId).toBe("key_custom");
    expect(vault.entriesCount).toBe(5);
  });
});

// ─── validateVaultName ───────────────────────────────────────────────────────

describe("validateVaultName", () => {
  it("passes for valid names", () => {
    expect(validateVaultName("my-vault").valid).toBe(true);
    expect(validateVaultName("abc").valid).toBe(true);
    expect(validateVaultName("A1B2-C3").valid).toBe(true);
  });

  it("fails for names shorter than 3 chars", () => {
    const result = validateVaultName("ab");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/3/);
  });

  it("fails for names longer than 64 chars", () => {
    const result = validateVaultName("a".repeat(65));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/64/);
  });

  it("fails for names with special characters", () => {
    const result = validateVaultName("my vault!");
    expect(result.valid).toBe(false);
  });

  it("fails for names with underscores", () => {
    const result = validateVaultName("my_vault");
    expect(result.valid).toBe(false);
  });

  it("fails for empty string", () => {
    const result = validateVaultName("");
    expect(result.valid).toBe(false);
  });

  it("passes for 64-char name", () => {
    expect(validateVaultName("a".repeat(64)).valid).toBe(true);
  });
});

// ─── summarizeVaults ─────────────────────────────────────────────────────────

describe("summarizeVaults", () => {
  const vaults: CredentialVault[] = [
    {
      id: "v1",
      name: "vault1",
      algorithm: "aes-256-gcm",
      keyId: "k1",
      createdAt: new Date(),
      entriesCount: 10,
    },
    {
      id: "v2",
      name: "vault2",
      algorithm: "aes-256-gcm",
      keyId: "k2",
      createdAt: new Date(),
      entriesCount: 5,
    },
    {
      id: "v3",
      name: "vault3",
      algorithm: "aes-256-cbc",
      keyId: "k3",
      createdAt: new Date(),
      entriesCount: 3,
    },
  ];

  it("returns correct total", () => {
    expect(summarizeVaults(vaults).total).toBe(3);
  });

  it("counts by algorithm", () => {
    const summary = summarizeVaults(vaults);
    expect(summary.byAlgorithm["aes-256-gcm"]).toBe(2);
    expect(summary.byAlgorithm["aes-256-cbc"]).toBe(1);
    expect(summary.byAlgorithm["chacha20-poly1305"]).toBe(0);
  });

  it("sums total entries", () => {
    expect(summarizeVaults(vaults).totalEntries).toBe(18);
  });

  it("handles empty array", () => {
    const summary = summarizeVaults([]);
    expect(summary.total).toBe(0);
    expect(summary.totalEntries).toBe(0);
  });
});
