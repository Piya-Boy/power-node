/**
 * Phase 42 — Live Collaboration & Presence Awareness
 * Pure utilities for real-time collaborative workflow editing.
 * Tracks user presence, cursor positions, node locks, and edit conflicts.
 * No WebSocket or database calls — all pure state manipulation.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type PresenceStatus = "active" | "idle" | "away" | "offline";

export type LockReason = "editing" | "moving" | "configuring";

export interface UserPresence {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  color: string;             // assigned color for cursor/highlight
  status: PresenceStatus;
  cursor?: { x: number; y: number };
  selectedNodeIds: string[];
  lastSeenAt: Date;
  joinedAt: Date;
}

export interface NodeLock {
  nodeId: string;
  lockedBy: string;          // userId
  reason: LockReason;
  lockedAt: Date;
  expiresAt: Date;           // locks auto-expire
}

export interface EditOperation {
  id: string;
  type: "node_add" | "node_delete" | "node_move" | "node_config" | "connection_add" | "connection_delete";
  userId: string;
  timestamp: Date;
  nodeId?: string;
  connectionId?: string;
  before?: unknown;          // snapshot before operation (for undo)
  after?: unknown;           // snapshot after operation
}

export interface CollaborationSession {
  workflowId: string;
  participants: UserPresence[];
  locks: NodeLock[];
  operationHistory: EditOperation[];
  maxHistorySize: number;
}

export interface ConflictResolution {
  hasConflict: boolean;
  conflictingUserId?: string;
  resolution?: "accept_mine" | "accept_theirs" | "merge";
  description?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Session Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new collaboration session for a workflow.
 */
export function createSession(workflowId: string, maxHistorySize = 100): CollaborationSession {
  return {
    workflowId,
    participants: [],
    locks: [],
    operationHistory: [],
    maxHistorySize,
  };
}

/**
 * Add a user to a collaboration session.
 */
export function joinSession(
  session: CollaborationSession,
  userId: string,
  displayName: string,
  avatarUrl?: string
): CollaborationSession {
  if (session.participants.some((p) => p.userId === userId)) {
    // Already in session — update to active
    return updatePresence(session, userId, { status: "active", lastSeenAt: new Date() });
  }

  const assignedColor = assignColor(
    session.participants.map((p) => p.color)
  );

  const presence: UserPresence = {
    userId,
    displayName,
    avatarUrl,
    color: assignedColor,
    status: "active",
    selectedNodeIds: [],
    lastSeenAt: new Date(),
    joinedAt: new Date(),
  };

  return { ...session, participants: [...session.participants, presence] };
}

/**
 * Remove a user from a collaboration session.
 */
export function leaveSession(
  session: CollaborationSession,
  userId: string
): CollaborationSession {
  return {
    ...session,
    participants: session.participants.filter((p) => p.userId !== userId),
    locks: session.locks.filter((l) => l.lockedBy !== userId),
  };
}

/**
 * Update a user's presence data (cursor, status, etc.).
 */
export function updatePresence(
  session: CollaborationSession,
  userId: string,
  updates: Partial<Omit<UserPresence, "userId">>
): CollaborationSession {
  return {
    ...session,
    participants: session.participants.map((p) =>
      p.userId === userId
        ? { ...p, ...updates, lastSeenAt: updates.lastSeenAt ?? new Date() }
        : p
    ),
  };
}

/**
 * Mark idle users (no activity for idleThresholdMs).
 */
export function markIdleUsers(
  session: CollaborationSession,
  idleThresholdMs = 60_000,
  now = new Date()
): CollaborationSession {
  return {
    ...session,
    participants: session.participants.map((p) => {
      const msSinceActivity = now.getTime() - p.lastSeenAt.getTime();
      if (p.status === "active" && msSinceActivity > idleThresholdMs) {
        return { ...p, status: "idle" };
      }
      return p;
    }),
  };
}

/**
 * Get active participants (status !== "offline").
 */
export function getActiveParticipants(session: CollaborationSession): UserPresence[] {
  return session.participants.filter((p) => p.status !== "offline");
}

// ─────────────────────────────────────────────────────────────────────────────
// Node Locking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Acquire a lock on a node for exclusive editing.
 * Returns null if the node is already locked by another user.
 */
export function acquireLock(
  session: CollaborationSession,
  nodeId: string,
  userId: string,
  reason: LockReason,
  ttlMs = 30_000,
  now = new Date()
): { session: CollaborationSession; acquired: boolean; lockedBy?: string } {
  const existing = getNodeLock(session, nodeId, now);

  if (existing && existing.lockedBy !== userId) {
    return { session, acquired: false, lockedBy: existing.lockedBy };
  }

  const lock: NodeLock = {
    nodeId,
    lockedBy: userId,
    reason,
    lockedAt: now,
    expiresAt: new Date(now.getTime() + ttlMs),
  };

  const locks = [
    ...session.locks.filter((l) => l.nodeId !== nodeId),
    lock,
  ];

  return { session: { ...session, locks }, acquired: true };
}

/**
 * Release a lock on a node.
 */
export function releaseLock(
  session: CollaborationSession,
  nodeId: string,
  userId: string
): CollaborationSession {
  return {
    ...session,
    locks: session.locks.filter(
      (l) => !(l.nodeId === nodeId && l.lockedBy === userId)
    ),
  };
}

/**
 * Get the current lock on a node (null if not locked or expired).
 */
export function getNodeLock(
  session: CollaborationSession,
  nodeId: string,
  now = new Date()
): NodeLock | null {
  const lock = session.locks.find((l) => l.nodeId === nodeId);
  if (!lock) return null;
  if (now >= lock.expiresAt) return null;
  return lock;
}

/**
 * Remove all expired locks from the session.
 */
export function purgeExpiredLocks(
  session: CollaborationSession,
  now = new Date()
): CollaborationSession {
  return {
    ...session,
    locks: session.locks.filter((l) => now < l.expiresAt),
  };
}

/**
 * Check if a user can edit a node (not locked by someone else).
 */
export function canEdit(
  session: CollaborationSession,
  nodeId: string,
  userId: string,
  now = new Date()
): boolean {
  const lock = getNodeLock(session, nodeId, now);
  if (!lock) return true;
  return lock.lockedBy === userId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Edit Operations & History
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record an edit operation in the session history.
 */
export function recordOperation(
  session: CollaborationSession,
  operation: Omit<EditOperation, "id" | "timestamp">
): CollaborationSession {
  const op: EditOperation = {
    ...operation,
    id: `op-${generateId()}`,
    timestamp: new Date(),
  };

  const history = [...session.operationHistory, op];
  const trimmed = history.length > session.maxHistorySize
    ? history.slice(history.length - session.maxHistorySize)
    : history;

  return { ...session, operationHistory: trimmed };
}

/**
 * Get the last N operations from the history.
 */
export function getRecentOperations(
  session: CollaborationSession,
  count = 10
): EditOperation[] {
  return session.operationHistory.slice(-count);
}

/**
 * Get all operations by a specific user.
 */
export function getOperationsByUser(
  session: CollaborationSession,
  userId: string
): EditOperation[] {
  return session.operationHistory.filter((op) => op.userId === userId);
}

/**
 * Get operations on a specific node.
 */
export function getOperationsForNode(
  session: CollaborationSession,
  nodeId: string
): EditOperation[] {
  return session.operationHistory.filter((op) => op.nodeId === nodeId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Conflict Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect if two concurrent operations conflict (both modify the same node).
 */
export function detectConflict(
  opA: EditOperation,
  opB: EditOperation,
  windowMs = 5000
): ConflictResolution {
  // Different nodes — no conflict
  if (!opA.nodeId || !opB.nodeId || opA.nodeId !== opB.nodeId) {
    return { hasConflict: false };
  }

  // Same user — no conflict
  if (opA.userId === opB.userId) {
    return { hasConflict: false };
  }

  const timeDiff = Math.abs(opA.timestamp.getTime() - opB.timestamp.getTime());
  if (timeDiff > windowMs) {
    return { hasConflict: false };
  }

  // Both are config changes — this is a real conflict
  if (opA.type === "node_config" && opB.type === "node_config") {
    return {
      hasConflict: true,
      conflictingUserId: opB.userId,
      resolution: "accept_theirs",
      description: `Both users modified the same node configuration within ${windowMs}ms`,
    };
  }

  // One deletes the node the other is editing
  if (
    (opA.type === "node_delete" && opB.type !== "node_delete") ||
    (opB.type === "node_delete" && opA.type !== "node_delete")
  ) {
    return {
      hasConflict: true,
      conflictingUserId: opB.userId,
      resolution: "accept_mine",
      description: "Conflict: node deleted while being edited",
    };
  }

  return { hasConflict: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Presence Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get users currently viewing/editing a specific node.
 */
export function getUsersOnNode(
  session: CollaborationSession,
  nodeId: string
): UserPresence[] {
  return session.participants.filter(
    (p) => p.status !== "offline" && p.selectedNodeIds.includes(nodeId)
  );
}

/**
 * Get a count of active collaborators.
 */
export function getCollaboratorCount(session: CollaborationSession): number {
  return session.participants.filter((p) => p.status !== "offline").length;
}

/**
 * Build a summary of session activity.
 */
export function getSessionSummary(session: CollaborationSession, now = new Date()): {
  workflowId: string;
  activeUsers: number;
  idleUsers: number;
  activeLocks: number;
  recentOperations: number;
  participants: Array<{ userId: string; displayName: string; color: string; status: PresenceStatus }>;
} {
  const activeLocks = session.locks.filter((l) => now < l.expiresAt).length;
  const oneMinuteAgo = new Date(now.getTime() - 60_000);
  const recentOps = session.operationHistory.filter(
    (op) => op.timestamp > oneMinuteAgo
  ).length;

  return {
    workflowId: session.workflowId,
    activeUsers: session.participants.filter((p) => p.status === "active").length,
    idleUsers: session.participants.filter((p) => p.status === "idle").length,
    activeLocks,
    recentOperations: recentOps,
    participants: session.participants.map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      color: p.color,
      status: p.status,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const PRESENCE_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#6366f1", "#a855f7", "#ec4899",
  "#14b8a6", "#f59e0b", "#84cc16", "#3b82f6",
];

function assignColor(usedColors: string[]): string {
  for (const color of PRESENCE_COLORS) {
    if (!usedColors.includes(color)) return color;
  }
  // All colors taken — reuse based on hash
  return PRESENCE_COLORS[usedColors.length % PRESENCE_COLORS.length];
}

function generateId(length = 12): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
