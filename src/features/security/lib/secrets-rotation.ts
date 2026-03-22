/**
 * Phase 85 — Workflow Secrets Rotation Manager
 * Pure utilities for tracking, scheduling, and auditing
 * secret rotation policies for workflow credentials.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SecretType =
  | "api_key"
  | "oauth_token"
  | "password"
  | "certificate"
  | "ssh_key"
  | "database_password"
  | "webhook_secret"
  | "encryption_key";

export type RotationStatus =
  | "active"
  | "pending_rotation"
  | "rotating"
  | "rotated"
  | "failed"
  | "expired"
  | "revoked";

export type RotationTrigger =
  | "scheduled"
  | "manual"
  | "breach_detected"
  | "policy_violation"
  | "expiry";

export interface RotationPolicy {
  intervalDays: number;      // rotate every N days
  warnDaysBeforeExpiry: number;
  autoRotate: boolean;
  retainVersions: number;    // how many old versions to keep
  notifyOnRotation: boolean;
}

export interface SecretVersion {
  version: number;
  createdAt: number;
  expiresAt?: number;
  revokedAt?: number;
  isActive: boolean;
  checksum: string;          // SHA-like hash for integrity (mock)
}

export interface ManagedSecret {
  id: string;
  name: string;
  type: SecretType;
  workflowId?: string;
  policy: RotationPolicy;
  status: RotationStatus;
  currentVersion: number;
  versions: SecretVersion[];
  lastRotatedAt?: number;
  nextRotationAt?: number;
  createdAt: number;
  updatedAt: number;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface RotationEvent {
  id: string;
  secretId: string;
  trigger: RotationTrigger;
  fromVersion: number;
  toVersion: number;
  performedAt: number;
  success: boolean;
  errorMessage?: string;
  performedBy?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default Policies by Type
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_POLICIES: Record<SecretType, RotationPolicy> = {
  api_key: {
    intervalDays: 90,
    warnDaysBeforeExpiry: 14,
    autoRotate: false,
    retainVersions: 3,
    notifyOnRotation: true,
  },
  oauth_token: {
    intervalDays: 30,
    warnDaysBeforeExpiry: 7,
    autoRotate: true,
    retainVersions: 2,
    notifyOnRotation: false,
  },
  password: {
    intervalDays: 90,
    warnDaysBeforeExpiry: 14,
    autoRotate: false,
    retainVersions: 5,
    notifyOnRotation: true,
  },
  certificate: {
    intervalDays: 365,
    warnDaysBeforeExpiry: 30,
    autoRotate: false,
    retainVersions: 2,
    notifyOnRotation: true,
  },
  ssh_key: {
    intervalDays: 180,
    warnDaysBeforeExpiry: 30,
    autoRotate: false,
    retainVersions: 3,
    notifyOnRotation: true,
  },
  database_password: {
    intervalDays: 60,
    warnDaysBeforeExpiry: 7,
    autoRotate: true,
    retainVersions: 3,
    notifyOnRotation: true,
  },
  webhook_secret: {
    intervalDays: 365,
    warnDaysBeforeExpiry: 30,
    autoRotate: false,
    retainVersions: 2,
    notifyOnRotation: true,
  },
  encryption_key: {
    intervalDays: 365,
    warnDaysBeforeExpiry: 60,
    autoRotate: false,
    retainVersions: 2,
    notifyOnRotation: true,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// ID Sequence
// ─────────────────────────────────────────────────────────────────────────────

let _idSeq = 0;
export function resetIdSeq(): void { _idSeq = 0; }

// ─────────────────────────────────────────────────────────────────────────────
// Managed Secret Creation
// ─────────────────────────────────────────────────────────────────────────────

function mockChecksum(version: number, id: string): string {
  // Deterministic fake checksum
  return `sha256:${id}_v${version}`;
}

export function createSecret(
  id: string,
  name: string,
  type: SecretType,
  now = Date.now(),
  policyOverrides: Partial<RotationPolicy> = {}
): ManagedSecret {
  const policy: RotationPolicy = { ...DEFAULT_POLICIES[type], ...policyOverrides };
  const expiresAt = now + policy.intervalDays * 86_400_000;

  const initialVersion: SecretVersion = {
    version: 1,
    createdAt: now,
    expiresAt,
    isActive: true,
    checksum: mockChecksum(1, id),
  };

  return {
    id,
    name,
    type,
    policy,
    status: "active",
    currentVersion: 1,
    versions: [initialVersion],
    lastRotatedAt: undefined,
    nextRotationAt: expiresAt,
    createdAt: now,
    updatedAt: now,
    tags: [],
    metadata: {},
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rotation Operations
// ─────────────────────────────────────────────────────────────────────────────

export function scheduleRotation(secret: ManagedSecret, now = Date.now()): ManagedSecret {
  return { ...secret, status: "pending_rotation", updatedAt: now };
}

export function beginRotation(secret: ManagedSecret, now = Date.now()): ManagedSecret {
  return { ...secret, status: "rotating", updatedAt: now };
}

export function completeRotation(
  secret: ManagedSecret,
  now = Date.now()
): { secret: ManagedSecret; event: RotationEvent } {
  const newVersion = secret.currentVersion + 1;
  const expiresAt = now + secret.policy.intervalDays * 86_400_000;

  const newSecretVersion: SecretVersion = {
    version: newVersion,
    createdAt: now,
    expiresAt,
    isActive: true,
    checksum: mockChecksum(newVersion, secret.id),
  };

  // Deactivate old version
  const updatedVersions = secret.versions.map((v) =>
    v.isActive ? { ...v, isActive: false } : v
  );

  // Prune old versions beyond retainVersions
  const allVersions = [...updatedVersions, newSecretVersion];
  const prunedVersions = allVersions.slice(
    Math.max(0, allVersions.length - secret.policy.retainVersions - 1)
  );

  const event: RotationEvent = {
    id: `evt_${++_idSeq}`,
    secretId: secret.id,
    trigger: "scheduled",
    fromVersion: secret.currentVersion,
    toVersion: newVersion,
    performedAt: now,
    success: true,
  };

  const updatedSecret: ManagedSecret = {
    ...secret,
    status: "active",
    currentVersion: newVersion,
    versions: prunedVersions,
    lastRotatedAt: now,
    nextRotationAt: expiresAt,
    updatedAt: now,
  };

  return { secret: updatedSecret, event };
}

export function failRotation(
  secret: ManagedSecret,
  errorMessage: string,
  now = Date.now()
): { secret: ManagedSecret; event: RotationEvent } {
  const event: RotationEvent = {
    id: `evt_${++_idSeq}`,
    secretId: secret.id,
    trigger: "scheduled",
    fromVersion: secret.currentVersion,
    toVersion: secret.currentVersion,
    performedAt: now,
    success: false,
    errorMessage,
  };

  return {
    secret: { ...secret, status: "failed", updatedAt: now },
    event,
  };
}

export function revokeSecret(secret: ManagedSecret, now = Date.now()): ManagedSecret {
  const versions = secret.versions.map((v) =>
    v.isActive ? { ...v, isActive: false, revokedAt: now } : v
  );
  return { ...secret, status: "revoked", versions, updatedAt: now };
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Checks
// ─────────────────────────────────────────────────────────────────────────────

export function isExpired(secret: ManagedSecret, now = Date.now()): boolean {
  const activeVersion = secret.versions.find((v) => v.isActive);
  if (!activeVersion?.expiresAt) return false;
  return now >= activeVersion.expiresAt;
}

export function isExpiringSoon(secret: ManagedSecret, now = Date.now()): boolean {
  const activeVersion = secret.versions.find((v) => v.isActive);
  if (!activeVersion?.expiresAt) return false;
  const warnMs = secret.policy.warnDaysBeforeExpiry * 86_400_000;
  return now >= activeVersion.expiresAt - warnMs && now < activeVersion.expiresAt;
}

export function daysUntilExpiry(secret: ManagedSecret, now = Date.now()): number | undefined {
  const activeVersion = secret.versions.find((v) => v.isActive);
  if (!activeVersion?.expiresAt) return undefined;
  return Math.max(0, Math.floor((activeVersion.expiresAt - now) / 86_400_000));
}

export function isRotationDue(secret: ManagedSecret, now = Date.now()): boolean {
  if (!secret.nextRotationAt) return false;
  return now >= secret.nextRotationAt;
}

export function getActiveVersion(secret: ManagedSecret): SecretVersion | undefined {
  return secret.versions.find((v) => v.isActive);
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk Queries
// ─────────────────────────────────────────────────────────────────────────────

export function getExpiredSecrets(secrets: ManagedSecret[], now = Date.now()): ManagedSecret[] {
  return secrets.filter((s) => isExpired(s, now));
}

export function getExpiringSoonSecrets(secrets: ManagedSecret[], now = Date.now()): ManagedSecret[] {
  return secrets.filter((s) => isExpiringSoon(s, now));
}

export function getOverdueRotations(secrets: ManagedSecret[], now = Date.now()): ManagedSecret[] {
  return secrets.filter((s) => s.status === "active" && isRotationDue(s, now));
}

export function getFailedRotations(secrets: ManagedSecret[]): ManagedSecret[] {
  return secrets.filter((s) => s.status === "failed");
}

export function getSecretsByType(secrets: ManagedSecret[], type: SecretType): ManagedSecret[] {
  return secrets.filter((s) => s.type === type);
}

export function getSecretsByStatus(secrets: ManagedSecret[], status: RotationStatus): ManagedSecret[] {
  return secrets.filter((s) => s.status === status);
}

// ─────────────────────────────────────────────────────────────────────────────
// Policy Utilities
// ─────────────────────────────────────────────────────────────────────────────

export function updatePolicy(
  secret: ManagedSecret,
  updates: Partial<RotationPolicy>,
  now = Date.now()
): ManagedSecret {
  const policy = { ...secret.policy, ...updates };
  const nextRotationAt = secret.lastRotatedAt
    ? secret.lastRotatedAt + policy.intervalDays * 86_400_000
    : secret.nextRotationAt;
  return { ...secret, policy, nextRotationAt, updatedAt: now };
}

export function validatePolicy(policy: RotationPolicy): string[] {
  const errors: string[] = [];
  if (policy.intervalDays <= 0) errors.push("intervalDays must be > 0");
  if (policy.warnDaysBeforeExpiry < 0) errors.push("warnDaysBeforeExpiry must be >= 0");
  if (policy.warnDaysBeforeExpiry >= policy.intervalDays) {
    errors.push("warnDaysBeforeExpiry must be < intervalDays");
  }
  if (policy.retainVersions < 1) errors.push("retainVersions must be >= 1");
  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rotation History
// ─────────────────────────────────────────────────────────────────────────────

export function getRotationHistory(
  events: RotationEvent[],
  secretId: string
): RotationEvent[] {
  return events
    .filter((e) => e.secretId === secretId)
    .sort((a, b) => b.performedAt - a.performedAt);
}

export function getSuccessfulRotations(events: RotationEvent[]): RotationEvent[] {
  return events.filter((e) => e.success);
}

export function getFailedRotationEvents(events: RotationEvent[]): RotationEvent[] {
  return events.filter((e) => !e.success);
}

export function getRotationSuccessRate(events: RotationEvent[]): number {
  if (events.length === 0) return 0;
  return events.filter((e) => e.success).length / events.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats & Summary
// ─────────────────────────────────────────────────────────────────────────────

export interface RotationStats {
  total: number;
  byStatus: Record<RotationStatus, number>;
  byType: Record<SecretType, number>;
  expired: number;
  expiringSoon: number;
  overdueRotation: number;
  failed: number;
}

export function computeRotationStats(
  secrets: ManagedSecret[],
  now = Date.now()
): RotationStats {
  const byStatus: Record<RotationStatus, number> = {
    active: 0, pending_rotation: 0, rotating: 0, rotated: 0, failed: 0, expired: 0, revoked: 0,
  };
  const byType: Record<SecretType, number> = {
    api_key: 0, oauth_token: 0, password: 0, certificate: 0, ssh_key: 0,
    database_password: 0, webhook_secret: 0, encryption_key: 0,
  };

  for (const s of secrets) {
    byStatus[s.status]++;
    byType[s.type]++;
  }

  return {
    total: secrets.length,
    byStatus,
    byType,
    expired: getExpiredSecrets(secrets, now).length,
    expiringSoon: getExpiringSoonSecrets(secrets, now).length,
    overdueRotation: getOverdueRotations(secrets, now).length,
    failed: byStatus.failed,
  };
}

export function summarizeSecret(secret: ManagedSecret, now = Date.now()): string {
  const days = daysUntilExpiry(secret, now);
  const expStr = days !== undefined ? `expires in ${days}d` : "no expiry";
  return `[${secret.status.toUpperCase()}] ${secret.name} (${secret.type}) v${secret.currentVersion} — ${expStr}`;
}
