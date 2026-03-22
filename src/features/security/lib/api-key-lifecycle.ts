/**
 * Phase 58 — API Key Lifecycle Manager
 * Pure utilities for creating, validating, rotating, revoking, and auditing API keys.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ApiKeyScope =
  | "read:workflows"
  | "write:workflows"
  | "execute:workflows"
  | "read:executions"
  | "manage:credentials"
  | "manage:members"
  | "admin";

export type ApiKeyStatus = "active" | "revoked" | "expired" | "rotated";

export type ApiKeyTier = "personal" | "service" | "integration" | "admin";

export interface ApiKey {
  id: string;
  prefix: string;         // first 8 chars shown publicly e.g. "pn_live_"
  hash: string;           // SHA-like hash of the actual key (not stored plaintext)
  name: string;
  description?: string;
  tier: ApiKeyTier;
  scopes: ApiKeyScope[];
  status: ApiKeyStatus;
  createdAt: Date;
  createdBy: string;
  expiresAt?: Date;
  lastUsedAt?: Date;
  revokedAt?: Date;
  revokedBy?: string;
  revokeReason?: string;
  rotatedFromId?: string;  // id of the key this was rotated from
  rotatedToId?: string;    // id of the key this was rotated into
  allowedIps?: string[];
  usageCount: number;
  rateLimitPerMinute?: number;
}

export interface ApiKeyValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ApiKeyUsageSummary {
  keyId: string;
  usageCount: number;
  lastUsedAt: Date | null;
  isExpired: boolean;
  isRevoked: boolean;
  daysUntilExpiry: number | null;
  scopeSummary: string;
}

export interface ApiKeyAuditEntry {
  timestamp: Date;
  keyId: string;
  action: "created" | "used" | "rotated" | "revoked" | "expired" | "updated";
  performedBy: string;
  ipAddress?: string;
  details?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Key Generation (pure / deterministic)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a key prefix based on tier and environment.
 */
export function buildKeyPrefix(tier: ApiKeyTier, env: "live" | "test" = "live"): string {
  const tierCode: Record<ApiKeyTier, string> = {
    personal: "pn",
    service: "svc",
    integration: "int",
    admin: "adm",
  };
  return `${tierCode[tier]}_${env}_`;
}

/**
 * Hash an API key secret (FNV-1a deterministic — not cryptographic, for testing).
 */
export function hashApiKey(key: string): string {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return "sha256:" + hash.toString(16).padStart(8, "0");
}

/**
 * Mask a full key for display: show prefix + first 4 chars + ****
 */
export function maskApiKey(fullKey: string): string {
  if (fullKey.length <= 12) return fullKey.slice(0, 4) + "****";
  return fullKey.slice(0, 12) + "****";
}

/**
 * Check whether a raw key matches a stored hash.
 */
export function verifyApiKey(rawKey: string, storedHash: string): boolean {
  return hashApiKey(rawKey) === storedHash;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

const ALL_SCOPES: ApiKeyScope[] = [
  "read:workflows",
  "write:workflows",
  "execute:workflows",
  "read:executions",
  "manage:credentials",
  "manage:members",
  "admin",
];

/**
 * Validate an API key configuration before creation/update.
 */
export function validateApiKey(key: Partial<ApiKey>): ApiKeyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!key.name || key.name.trim() === "") {
    errors.push("name is required");
  } else if (key.name.length > 100) {
    errors.push("name must be 100 characters or fewer");
  }

  if (!key.scopes || key.scopes.length === 0) {
    errors.push("at least one scope is required");
  } else {
    const invalid = key.scopes.filter((s) => !ALL_SCOPES.includes(s));
    if (invalid.length > 0) {
      errors.push(`invalid scopes: ${invalid.join(", ")}`);
    }
    if (key.scopes.includes("admin") && key.scopes.length > 1) {
      warnings.push("admin scope grants all permissions — other scopes are redundant");
    }
  }

  if (key.expiresAt) {
    if (key.expiresAt <= new Date()) {
      errors.push("expiresAt must be in the future");
    }
    const daysUntilExpiry = (key.expiresAt.getTime() - Date.now()) / 86_400_000;
    if (daysUntilExpiry < 7) {
      warnings.push("key expires in less than 7 days");
    }
  }

  if (key.rateLimitPerMinute !== undefined && key.rateLimitPerMinute < 1) {
    errors.push("rateLimitPerMinute must be at least 1");
  }

  if (key.allowedIps) {
    const invalidIps = key.allowedIps.filter((ip) => !isValidIpOrCidr(ip));
    if (invalidIps.length > 0) {
      errors.push(`invalid IP addresses or CIDR ranges: ${invalidIps.join(", ")}`);
    }
  }

  if (key.tier === "admin" && !key.allowedIps) {
    warnings.push("admin keys should restrict allowed IPs in production");
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle Operations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new API key record (id and hash must be provided externally).
 */
export function createApiKey(params: {
  id: string;
  prefix: string;
  hash: string;
  name: string;
  description?: string;
  tier: ApiKeyTier;
  scopes: ApiKeyScope[];
  createdBy: string;
  expiresAt?: Date;
  allowedIps?: string[];
  rateLimitPerMinute?: number;
}): ApiKey {
  return {
    id: params.id,
    prefix: params.prefix,
    hash: params.hash,
    name: params.name,
    description: params.description,
    tier: params.tier,
    scopes: [...new Set(params.scopes)],
    status: "active",
    createdAt: new Date(),
    createdBy: params.createdBy,
    expiresAt: params.expiresAt,
    allowedIps: params.allowedIps,
    rateLimitPerMinute: params.rateLimitPerMinute,
    usageCount: 0,
  };
}

/**
 * Revoke an API key.
 */
export function revokeApiKey(key: ApiKey, params: {
  revokedBy: string;
  reason?: string;
  now?: Date;
}): ApiKey {
  return {
    ...key,
    status: "revoked",
    revokedAt: params.now ?? new Date(),
    revokedBy: params.revokedBy,
    revokeReason: params.reason,
  };
}

/**
 * Record key usage (immutably).
 */
export function recordKeyUsage(key: ApiKey, now?: Date): ApiKey {
  return {
    ...key,
    lastUsedAt: now ?? new Date(),
    usageCount: key.usageCount + 1,
  };
}

/**
 * Rotate a key: marks old key as "rotated" and links it to the new key.
 */
export function rotateApiKey(oldKey: ApiKey, newKey: ApiKey): { oldKey: ApiKey; newKey: ApiKey } {
  return {
    oldKey: { ...oldKey, status: "rotated", rotatedToId: newKey.id },
    newKey: { ...newKey, rotatedFromId: oldKey.id },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Checks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a key is currently valid (active + not expired + not revoked).
 */
export function isKeyValid(key: ApiKey, now?: Date): boolean {
  const ts = now ?? new Date();
  if (key.status !== "active") return false;
  if (key.expiresAt && key.expiresAt <= ts) return false;
  return true;
}

/**
 * Check if a key has expired.
 */
export function isKeyExpired(key: ApiKey, now?: Date): boolean {
  if (!key.expiresAt) return false;
  return key.expiresAt <= (now ?? new Date());
}

/**
 * Get days until expiry. Returns null if no expiry set, negative if already expired.
 */
export function getDaysUntilExpiry(key: ApiKey, now?: Date): number | null {
  if (!key.expiresAt) return null;
  const ts = now ?? new Date();
  return (key.expiresAt.getTime() - ts.getTime()) / 86_400_000;
}

/**
 * Check if a key has a given scope (admin scope grants all).
 */
export function hasScope(key: ApiKey, scope: ApiKeyScope): boolean {
  return key.scopes.includes("admin") || key.scopes.includes(scope);
}

/**
 * Check whether a request IP is allowed for this key.
 */
export function isIpAllowed(key: ApiKey, ip: string): boolean {
  if (!key.allowedIps || key.allowedIps.length === 0) return true;
  return key.allowedIps.some((allowed) => ipMatchesCidr(ip, allowed));
}

// ─────────────────────────────────────────────────────────────────────────────
// Usage Summary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a usage summary for a key.
 */
export function buildUsageSummary(key: ApiKey, now?: Date): ApiKeyUsageSummary {
  const daysUntilExpiry = getDaysUntilExpiry(key, now);
  const scopeSummary = key.scopes.includes("admin")
    ? "admin (all)"
    : key.scopes.join(", ");

  return {
    keyId: key.id,
    usageCount: key.usageCount,
    lastUsedAt: key.lastUsedAt ?? null,
    isExpired: isKeyExpired(key, now),
    isRevoked: key.status === "revoked",
    daysUntilExpiry,
    scopeSummary,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit Log
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create an audit log entry for a key action.
 */
export function createAuditEntry(params: {
  keyId: string;
  action: ApiKeyAuditEntry["action"];
  performedBy: string;
  ipAddress?: string;
  details?: string;
  now?: Date;
}): ApiKeyAuditEntry {
  return {
    timestamp: params.now ?? new Date(),
    keyId: params.keyId,
    action: params.action,
    performedBy: params.performedBy,
    ipAddress: params.ipAddress,
    details: params.details,
  };
}

/**
 * Filter audit entries by key id.
 */
export function getAuditEntriesForKey(entries: ApiKeyAuditEntry[], keyId: string): ApiKeyAuditEntry[] {
  return entries.filter((e) => e.keyId === keyId);
}

/**
 * Get all keys expiring within a given number of days.
 */
export function getKeysExpiringWithin(keys: ApiKey[], days: number, now?: Date): ApiKey[] {
  const ts = now ?? new Date();
  const threshold = new Date(ts.getTime() + days * 86_400_000);
  return keys.filter((k) => {
    if (k.status !== "active") return false;
    if (!k.expiresAt) return false;
    return k.expiresAt > ts && k.expiresAt <= threshold;
  });
}

/**
 * Summarize a set of keys: counts by status and tier.
 */
export function summarizeKeys(keys: ApiKey[]): {
  total: number;
  active: number;
  revoked: number;
  expired: number;
  rotated: number;
  byTier: Record<ApiKeyTier, number>;
} {
  const byTier: Record<ApiKeyTier, number> = {
    personal: 0,
    service: 0,
    integration: 0,
    admin: 0,
  };
  let active = 0, revoked = 0, expired = 0, rotated = 0;

  for (const k of keys) {
    byTier[k.tier] = (byTier[k.tier] ?? 0) + 1;
    if (k.status === "active") active++;
    else if (k.status === "revoked") revoked++;
    else if (k.status === "expired") expired++;
    else if (k.status === "rotated") rotated++;
  }

  return { total: keys.length, active, revoked, expired, rotated, byTier };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isValidIpOrCidr(value: string): boolean {
  // Simple IPv4 or CIDR check
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
  if (!ipv4.test(value)) return false;
  const parts = value.split("/")[0].split(".");
  return parts.every((p) => parseInt(p, 10) <= 255);
}

function ipMatchesCidr(ip: string, cidr: string): boolean {
  if (!cidr.includes("/")) return ip === cidr;
  const [base, prefixStr] = cidr.split("/");
  const prefix = parseInt(prefixStr, 10);
  return ipToInt(ip) >>> (32 - prefix) === ipToInt(base) >>> (32 - prefix);
}

function ipToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}
