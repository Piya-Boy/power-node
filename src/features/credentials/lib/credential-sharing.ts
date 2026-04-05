/**
 * Phase 94 — Credential Sharing
 * Utilities for sharing credentials between team members with permission control.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type SharePermission = "use" | "view" | "manage";

export interface SharedCredential {
  id: string;
  credentialId: string;
  ownerId: string;
  targetUserId: string;
  permission: SharePermission;
  sharedAt: Date;
  expiresAt?: Date;
  revokedAt?: Date;
  note?: string;
}

export interface ShareEntry {
  shareId: string;
  targetUserId: string;
  permission: SharePermission;
  sharedAt: Date;
  expiresAt?: Date;
  isActive: boolean;
}

export interface SharingStats {
  totalShares: number;
  activeShares: number;
  expiredShares: number;
  revokedShares: number;
  byPermission: Record<SharePermission, number>;
  mostSharedCredentials: Array<{ credentialId: string; shareCount: number }>;
}

export interface ShareValidation {
  valid: boolean;
  errors: string[];
}

// ─── Core ────────────────────────────────────────────────────────────────────

let _idSeq = 1;
export function resetShareIdSeq() { _idSeq = 1; }

/**
 * Create a new credential share record.
 */
export function createShare(
  credentialId: string,
  ownerId: string,
  targetUserId: string,
  permission: SharePermission,
  opts: { expiresAt?: Date; note?: string } = {}
): SharedCredential {
  return {
    id: `share_${_idSeq++}`,
    credentialId,
    ownerId,
    targetUserId,
    permission,
    sharedAt: new Date(),
    expiresAt: opts.expiresAt,
    note: opts.note,
  };
}

/**
 * Revoke an existing share. Returns the updated record.
 */
export function revokeShare(share: SharedCredential): SharedCredential {
  return { ...share, revokedAt: new Date() };
}

/**
 * Check whether a share record is currently active (not revoked, not expired).
 */
export function isShareActive(share: SharedCredential): boolean {
  if (share.revokedAt) return false;
  if (share.expiresAt && new Date() > share.expiresAt) return false;
  return true;
}

/**
 * Validate a share request before creating it.
 */
export function validateShare(
  credentialId: string,
  ownerId: string,
  targetUserId: string,
  permission: SharePermission
): ShareValidation {
  const errors: string[] = [];

  if (!credentialId || credentialId.trim().length === 0) {
    errors.push("credentialId is required");
  }
  if (!ownerId || ownerId.trim().length === 0) {
    errors.push("ownerId is required");
  }
  if (!targetUserId || targetUserId.trim().length === 0) {
    errors.push("targetUserId is required");
  }
  if (ownerId === targetUserId) {
    errors.push("Cannot share credential with yourself");
  }
  if (!["use", "view", "manage"].includes(permission)) {
    errors.push(`Invalid permission '${permission}'. Must be use, view, or manage`);
  }

  return { valid: errors.length === 0, errors };
}

// ─── Access Control ───────────────────────────────────────────────────────────

/**
 * Check if a user has access to a credential via a share.
 * Owners always have access.
 */
export function hasCredentialAccess(
  shares: SharedCredential[],
  credentialId: string,
  userId: string,
  ownerId: string
): boolean {
  if (userId === ownerId) return true;
  return shares.some(
    (s) =>
      s.credentialId === credentialId &&
      s.targetUserId === userId &&
      isShareActive(s)
  );
}

/**
 * Get the effective permission a user has on a credential.
 * Returns null if the user has no access.
 */
export function getEffectivePermission(
  shares: SharedCredential[],
  credentialId: string,
  userId: string,
  ownerId: string
): SharePermission | null {
  if (userId === ownerId) return "manage";
  const active = shares.filter(
    (s) =>
      s.credentialId === credentialId &&
      s.targetUserId === userId &&
      isShareActive(s)
  );
  if (active.length === 0) return null;
  // Highest permission wins: manage > view > use
  const rank: Record<SharePermission, number> = { manage: 3, view: 2, use: 1 };
  return active.reduce<SharePermission>(
    (best, s) => (rank[s.permission] > rank[best] ? s.permission : best),
    active[0].permission
  );
}

/**
 * Check if a user can perform a specific action on a credential.
 */
export function canPerformAction(
  shares: SharedCredential[],
  credentialId: string,
  userId: string,
  ownerId: string,
  required: SharePermission
): boolean {
  const effective = getEffectivePermission(shares, credentialId, userId, ownerId);
  if (!effective) return false;
  const rank: Record<SharePermission, number> = { manage: 3, view: 2, use: 1 };
  return rank[effective] >= rank[required];
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Get all active shares for a credential.
 */
export function getSharesForCredential(
  shares: SharedCredential[],
  credentialId: string
): ShareEntry[] {
  return shares
    .filter((s) => s.credentialId === credentialId)
    .map((s) => ({
      shareId: s.id,
      targetUserId: s.targetUserId,
      permission: s.permission,
      sharedAt: s.sharedAt,
      expiresAt: s.expiresAt,
      isActive: isShareActive(s),
    }));
}

/**
 * List credentials shared with a specific user (active only by default).
 */
export function listCredentialsSharedWith(
  shares: SharedCredential[],
  userId: string,
  activeOnly = true
): SharedCredential[] {
  return shares.filter(
    (s) => s.targetUserId === userId && (!activeOnly || isShareActive(s))
  );
}

/**
 * List credentials that an owner has shared out.
 */
export function listSharesByOwner(
  shares: SharedCredential[],
  ownerId: string,
  activeOnly = true
): SharedCredential[] {
  return shares.filter(
    (s) => s.ownerId === ownerId && (!activeOnly || isShareActive(s))
  );
}

/**
 * Find an existing active share between two users for a credential.
 */
export function findActiveShare(
  shares: SharedCredential[],
  credentialId: string,
  targetUserId: string
): SharedCredential | undefined {
  return shares.find(
    (s) =>
      s.credentialId === credentialId &&
      s.targetUserId === targetUserId &&
      isShareActive(s)
  );
}

// ─── Mutation Helpers ─────────────────────────────────────────────────────────

/**
 * Update the permission on an existing share. Returns updated record.
 */
export function updateSharePermission(
  share: SharedCredential,
  newPermission: SharePermission
): SharedCredential {
  return { ...share, permission: newPermission };
}

/**
 * Extend the expiry of a share. Returns updated record.
 */
export function extendShareExpiry(
  share: SharedCredential,
  newExpiresAt: Date
): SharedCredential {
  return { ...share, expiresAt: newExpiresAt };
}

/**
 * Revoke all active shares for a credential (e.g. when credential is deleted).
 */
export function revokeAllShares(shares: SharedCredential[], credentialId: string): SharedCredential[] {
  return shares.map((s) =>
    s.credentialId === credentialId && isShareActive(s) ? revokeShare(s) : s
  );
}

// ─── Stats ────────────────────────────────────────────────────────────────────

/**
 * Compute sharing statistics across all share records.
 */
export function computeSharingStats(shares: SharedCredential[]): SharingStats {
  const byPermission: Record<SharePermission, number> = { use: 0, view: 0, manage: 0 };
  let activeShares = 0;
  let expiredShares = 0;
  let revokedShares = 0;

  const credentialCounts: Record<string, number> = {};

  for (const s of shares) {
    byPermission[s.permission] = (byPermission[s.permission] ?? 0) + 1;

    if (s.revokedAt) {
      revokedShares++;
    } else if (s.expiresAt && new Date() > s.expiresAt) {
      expiredShares++;
    } else {
      activeShares++;
      credentialCounts[s.credentialId] = (credentialCounts[s.credentialId] ?? 0) + 1;
    }
  }

  const mostSharedCredentials = Object.entries(credentialCounts)
    .map(([credentialId, shareCount]) => ({ credentialId, shareCount }))
    .sort((a, b) => b.shareCount - a.shareCount)
    .slice(0, 5);

  return {
    totalShares: shares.length,
    activeShares,
    expiredShares,
    revokedShares,
    byPermission,
    mostSharedCredentials,
  };
}

/**
 * Human-readable description of a share.
 */
export function describeShare(share: SharedCredential): string {
  const status = isShareActive(share)
    ? "active"
    : share.revokedAt
    ? "revoked"
    : "expired";
  return `Credential ${share.credentialId} shared with ${share.targetUserId} [${share.permission}] — ${status}`;
}
