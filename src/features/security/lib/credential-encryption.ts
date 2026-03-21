// Phase 51 — Credential Encryption Utils

export type EncryptionAlgorithm = "aes-256-gcm" | "aes-256-cbc" | "chacha20-poly1305";
export type KeyDerivationFunction = "pbkdf2" | "scrypt" | "argon2id";

export interface EncryptedPayload {
  algorithm: EncryptionAlgorithm;
  iv: string;           // hex-encoded
  ciphertext: string;   // base64-encoded
  authTag?: string;     // for GCM/AEAD
  salt?: string;        // if key was derived
  kdf?: KeyDerivationFunction;
  keyId?: string;       // reference to key in key store
  version: number;      // payload format version
}

export interface CredentialVault {
  id: string;
  name: string;
  algorithm: EncryptionAlgorithm;
  keyId: string;
  createdAt: Date;
  rotatedAt?: Date;
  entriesCount: number;
}

export interface KeyRotationPlan {
  vaultId: string;
  oldKeyId: string;
  newKeyId: string;
  entriesTotal: number;
  entriesMigrated: number;
  startedAt: Date;
  completedAt?: Date;
  status: "pending" | "in-progress" | "completed" | "failed";
  failureReason?: string;
}

// ─── Payload Serialization ───────────────────────────────────────────────────

/**
 * Serialize an EncryptedPayload to a base64-encoded JSON string.
 */
export function encodePayload(payload: EncryptedPayload): string {
  const json = JSON.stringify(payload);
  return Buffer.from(json, "utf8").toString("base64");
}

/**
 * Deserialize a base64-encoded JSON string back to an EncryptedPayload.
 * Returns null on any parsing error.
 */
export function decodePayload(encoded: string): EncryptedPayload | null {
  try {
    const json = Buffer.from(encoded, "base64").toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as EncryptedPayload;
  } catch {
    return null;
  }
}

// ─── Payload Validation ──────────────────────────────────────────────────────

const VALID_ALGORITHMS: EncryptionAlgorithm[] = [
  "aes-256-gcm",
  "aes-256-cbc",
  "chacha20-poly1305",
];
const VALID_KDFS: KeyDerivationFunction[] = ["pbkdf2", "scrypt", "argon2id"];

/**
 * Validate an EncryptedPayload structure.
 */
export function validateEncryptedPayload(payload: EncryptedPayload): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!VALID_ALGORITHMS.includes(payload.algorithm)) {
    errors.push(`Invalid algorithm: ${payload.algorithm}`);
  }

  if (!payload.iv || typeof payload.iv !== "string" || payload.iv.trim() === "") {
    errors.push("iv is required and must be a non-empty string");
  } else if (!/^[0-9a-fA-F]+$/.test(payload.iv)) {
    errors.push("iv must be hex-encoded");
  }

  if (
    !payload.ciphertext ||
    typeof payload.ciphertext !== "string" ||
    payload.ciphertext.trim() === ""
  ) {
    errors.push("ciphertext is required and must be a non-empty string");
  }

  if (typeof payload.version !== "number" || !Number.isInteger(payload.version) || payload.version < 1) {
    errors.push("version must be a positive integer");
  }

  if (payload.kdf !== undefined && !VALID_KDFS.includes(payload.kdf)) {
    errors.push(`Invalid kdf: ${payload.kdf}`);
  }

  // AES-256-GCM and chacha20-poly1305 should have authTag
  if (
    (payload.algorithm === "aes-256-gcm" || payload.algorithm === "chacha20-poly1305") &&
    !payload.authTag
  ) {
    errors.push(`authTag is required for ${payload.algorithm}`);
  }

  // If kdf is provided, salt must be present
  if (payload.kdf && !payload.salt) {
    errors.push("salt is required when kdf is specified");
  }

  return { valid: errors.length === 0, errors };
}

// ─── Credential Masking ──────────────────────────────────────────────────────

/**
 * Mask a credential string, showing first/last N characters and replacing the
 * middle with "***".
 *
 * @param value - The credential value to mask.
 * @param visibleChars - Number of characters to reveal at both ends (default 4).
 */
export function maskCredential(value: string, visibleChars = 4): string {
  if (!value || typeof value !== "string") return "***";
  if (value.length <= visibleChars * 2) {
    return "*".repeat(value.length);
  }
  const start = value.slice(0, visibleChars);
  const end = value.slice(-visibleChars);
  return `${start}***${end}`;
}

/**
 * Mask all values in a credential map.
 */
export function maskCredentialMap(
  creds: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(creds)) {
    result[key] = maskCredential(value);
  }
  return result;
}

// ─── Credential Type Detection ───────────────────────────────────────────────

/**
 * Detect the type of a credential from its format.
 */
export function detectCredentialType(
  value: string
): "api-key" | "jwt" | "basic-auth" | "bearer" | "oauth-token" | "unknown" {
  if (!value || typeof value !== "string") return "unknown";

  const trimmed = value.trim();

  // JWT: three base64url segments separated by dots
  if (/^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(trimmed)) {
    return "jwt";
  }

  // Basic Auth: "Basic <base64>"
  if (/^Basic\s+[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return "basic-auth";
  }

  // Bearer token: "Bearer <token>"
  if (/^Bearer\s+\S+$/i.test(trimmed)) {
    return "bearer";
  }

  // OAuth token: starts with "ya29." (Google) or common patterns
  if (/^ya29\.[A-Za-z0-9\-_]+$/.test(trimmed)) {
    return "oauth-token";
  }

  // OAuth-style: "oauth_" prefix or similar
  if (/^oauth[_\-]/i.test(trimmed)) {
    return "oauth-token";
  }

  // API key heuristic: 20+ alphanumeric chars / common API key patterns
  // e.g. sk-xxx, pk_xxx, key_xxx etc.
  if (
    /^(sk|pk|api|key|tok|secret)[_\-][A-Za-z0-9\-_]{8,}$/i.test(trimmed) ||
    /^[A-Za-z0-9]{20,}$/.test(trimmed)
  ) {
    return "api-key";
  }

  return "unknown";
}

// ─── Key ID Generation ───────────────────────────────────────────────────────

/**
 * Generate a unique key ID with the format `key_<16 hex chars>`.
 */
export function generateKeyId(): string {
  const hex = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
  return `key_${hex}`;
}

// ─── Key Rotation Plan ───────────────────────────────────────────────────────

/**
 * Create a new key rotation plan.
 */
export function createKeyRotationPlan(
  vaultId: string,
  oldKeyId: string,
  newKeyId: string,
  entriesTotal: number
): KeyRotationPlan {
  return {
    vaultId,
    oldKeyId,
    newKeyId,
    entriesTotal,
    entriesMigrated: 0,
    startedAt: new Date(),
    status: "pending",
  };
}

/**
 * Update the number of migrated entries and transition to in-progress.
 */
export function updateRotationProgress(
  plan: KeyRotationPlan,
  migratedCount: number
): KeyRotationPlan {
  return {
    ...plan,
    entriesMigrated: migratedCount,
    status: "in-progress",
  };
}

/**
 * Mark the rotation plan as completed.
 */
export function completeRotation(plan: KeyRotationPlan): KeyRotationPlan {
  return {
    ...plan,
    entriesMigrated: plan.entriesTotal,
    completedAt: new Date(),
    status: "completed",
  };
}

/**
 * Mark the rotation plan as failed with a reason.
 */
export function failRotation(
  plan: KeyRotationPlan,
  reason: string
): KeyRotationPlan {
  return {
    ...plan,
    completedAt: new Date(),
    status: "failed",
    failureReason: reason,
  };
}

/**
 * Check whether a rotation plan has been completed.
 */
export function isRotationComplete(plan: KeyRotationPlan): boolean {
  return plan.status === "completed";
}

/**
 * Get the rotation progress as a percentage (0-100).
 */
export function getRotationProgressPercent(plan: KeyRotationPlan): number {
  if (plan.entriesTotal === 0) return 100;
  return Math.round((plan.entriesMigrated / plan.entriesTotal) * 100);
}

// ─── Credential Vault ────────────────────────────────────────────────────────

/**
 * Create a new CredentialVault.
 */
export function createVault(params: {
  id: string;
  name: string;
  algorithm?: EncryptionAlgorithm;
  keyId?: string;
  entriesCount?: number;
}): CredentialVault {
  return {
    id: params.id,
    name: params.name,
    algorithm: params.algorithm ?? "aes-256-gcm",
    keyId: params.keyId ?? generateKeyId(),
    createdAt: new Date(),
    entriesCount: params.entriesCount ?? 0,
  };
}

/**
 * Validate a vault name (alphanumeric + hyphens, 3–64 characters).
 */
export function validateVaultName(name: string): {
  valid: boolean;
  error?: string;
} {
  if (!name || typeof name !== "string") {
    return { valid: false, error: "Vault name is required" };
  }
  if (name.length < 3) {
    return { valid: false, error: "Vault name must be at least 3 characters" };
  }
  if (name.length > 64) {
    return {
      valid: false,
      error: "Vault name must be at most 64 characters",
    };
  }
  if (!/^[A-Za-z0-9-]+$/.test(name)) {
    return {
      valid: false,
      error: "Vault name may only contain alphanumeric characters and hyphens",
    };
  }
  return { valid: true };
}

// ─── Vault Summary ───────────────────────────────────────────────────────────

/**
 * Summarize an array of vaults.
 */
export function summarizeVaults(vaults: CredentialVault[]): {
  total: number;
  byAlgorithm: Record<EncryptionAlgorithm, number>;
  totalEntries: number;
} {
  const byAlgorithm: Record<EncryptionAlgorithm, number> = {
    "aes-256-gcm": 0,
    "aes-256-cbc": 0,
    "chacha20-poly1305": 0,
  };
  let totalEntries = 0;

  for (const vault of vaults) {
    byAlgorithm[vault.algorithm] = (byAlgorithm[vault.algorithm] ?? 0) + 1;
    totalEntries += vault.entriesCount;
  }

  return {
    total: vaults.length,
    byAlgorithm,
    totalEntries,
  };
}
