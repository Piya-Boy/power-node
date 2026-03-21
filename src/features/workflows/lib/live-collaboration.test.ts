import { describe, it, expect } from "vitest";
import {
  createSession,
  joinSession,
  leaveSession,
  updatePresence,
  markIdleUsers,
  getActiveParticipants,
  acquireLock,
  releaseLock,
  getNodeLock,
  purgeExpiredLocks,
  canEdit,
  recordOperation,
  getRecentOperations,
  getOperationsByUser,
  getOperationsForNode,
  detectConflict,
  getUsersOnNode,
  getCollaboratorCount,
  getSessionSummary,
  type CollaborationSession,
  type EditOperation,
} from "./live-collaboration";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeSession(): CollaborationSession {
  return createSession("wf-1");
}

function makeOp(overrides: Partial<EditOperation> = {}): Omit<EditOperation, "id" | "timestamp"> {
  return {
    type: "node_config",
    userId: "user-1",
    nodeId: "node-1",
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// createSession
// ─────────────────────────────────────────────────────────────────────────────

describe("createSession", () => {
  it("creates empty session", () => {
    const session = createSession("wf-1");
    expect(session.workflowId).toBe("wf-1");
    expect(session.participants).toHaveLength(0);
    expect(session.locks).toHaveLength(0);
    expect(session.operationHistory).toHaveLength(0);
    expect(session.maxHistorySize).toBe(100);
  });

  it("uses custom maxHistorySize", () => {
    const session = createSession("wf-1", 50);
    expect(session.maxHistorySize).toBe(50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// joinSession
// ─────────────────────────────────────────────────────────────────────────────

describe("joinSession", () => {
  it("adds user to session", () => {
    const session = joinSession(makeSession(), "user-1", "Alice");
    expect(session.participants).toHaveLength(1);
    expect(session.participants[0].userId).toBe("user-1");
    expect(session.participants[0].displayName).toBe("Alice");
    expect(session.participants[0].status).toBe("active");
    expect(session.participants[0].color).toBeTruthy();
  });

  it("assigns different colors to different users", () => {
    let session = makeSession();
    session = joinSession(session, "u1", "Alice");
    session = joinSession(session, "u2", "Bob");
    const colors = session.participants.map((p) => p.color);
    expect(new Set(colors).size).toBe(2);
  });

  it("re-joining sets user to active", () => {
    let session = makeSession();
    session = joinSession(session, "u1", "Alice");
    session = updatePresence(session, "u1", { status: "idle" });
    session = joinSession(session, "u1", "Alice"); // rejoin
    expect(session.participants[0].status).toBe("active");
    expect(session.participants).toHaveLength(1); // no duplicates
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// leaveSession
// ─────────────────────────────────────────────────────────────────────────────

describe("leaveSession", () => {
  it("removes user from session", () => {
    let session = joinSession(makeSession(), "u1", "Alice");
    session = joinSession(session, "u2", "Bob");
    session = leaveSession(session, "u1");
    expect(session.participants).toHaveLength(1);
    expect(session.participants[0].userId).toBe("u2");
  });

  it("removes user's locks when leaving", () => {
    let session = joinSession(makeSession(), "u1", "Alice");
    const result = acquireLock(session, "node-1", "u1", "editing");
    session = result.session;
    session = leaveSession(session, "u1");
    expect(session.locks).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updatePresence
// ─────────────────────────────────────────────────────────────────────────────

describe("updatePresence", () => {
  it("updates cursor position", () => {
    let session = joinSession(makeSession(), "u1", "Alice");
    session = updatePresence(session, "u1", { cursor: { x: 100, y: 200 } });
    expect(session.participants[0].cursor).toEqual({ x: 100, y: 200 });
  });

  it("updates selected nodes", () => {
    let session = joinSession(makeSession(), "u1", "Alice");
    session = updatePresence(session, "u1", { selectedNodeIds: ["n1", "n2"] });
    expect(session.participants[0].selectedNodeIds).toEqual(["n1", "n2"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// markIdleUsers
// ─────────────────────────────────────────────────────────────────────────────

describe("markIdleUsers", () => {
  it("marks users idle after threshold", () => {
    let session = joinSession(makeSession(), "u1", "Alice");
    // Set lastSeenAt to 2 minutes ago
    const twoMinutesAgo = new Date(Date.now() - 120_000);
    session = updatePresence(session, "u1", { lastSeenAt: twoMinutesAgo });
    session = markIdleUsers(session, 60_000);
    expect(session.participants[0].status).toBe("idle");
  });

  it("does not mark recently active users", () => {
    let session = joinSession(makeSession(), "u1", "Alice");
    session = markIdleUsers(session, 60_000);
    expect(session.participants[0].status).toBe("active");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getActiveParticipants
// ─────────────────────────────────────────────────────────────────────────────

describe("getActiveParticipants", () => {
  it("excludes offline users", () => {
    let session = joinSession(makeSession(), "u1", "Alice");
    session = joinSession(session, "u2", "Bob");
    session = updatePresence(session, "u2", { status: "offline" });
    expect(getActiveParticipants(session)).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// acquireLock / releaseLock / getNodeLock
// ─────────────────────────────────────────────────────────────────────────────

describe("acquireLock", () => {
  it("acquires lock on unlocked node", () => {
    const session = joinSession(makeSession(), "u1", "Alice");
    const { acquired, session: newSession } = acquireLock(session, "node-1", "u1", "editing");
    expect(acquired).toBe(true);
    expect(newSession.locks).toHaveLength(1);
    expect(newSession.locks[0].lockedBy).toBe("u1");
  });

  it("fails to acquire lock on node locked by another user", () => {
    let session = joinSession(makeSession(), "u1", "Alice");
    session = joinSession(session, "u2", "Bob");
    const result1 = acquireLock(session, "node-1", "u1", "editing");
    session = result1.session;
    const result2 = acquireLock(session, "node-1", "u2", "editing");
    expect(result2.acquired).toBe(false);
    expect(result2.lockedBy).toBe("u1");
  });

  it("allows re-acquiring own lock", () => {
    let session = joinSession(makeSession(), "u1", "Alice");
    session = acquireLock(session, "node-1", "u1", "editing").session;
    const result = acquireLock(session, "node-1", "u1", "configuring");
    expect(result.acquired).toBe(true);
  });

  it("treats expired lock as available", () => {
    let session = joinSession(makeSession(), "u1", "Alice");
    session = joinSession(session, "u2", "Bob");
    // Acquire with 1ms TTL
    const past = new Date(Date.now() - 1000);
    const result1 = acquireLock(session, "node-1", "u1", "editing", 1, past);
    session = result1.session;
    // u2 should be able to acquire since the lock expired
    const result2 = acquireLock(session, "node-1", "u2", "editing");
    expect(result2.acquired).toBe(true);
  });
});

describe("releaseLock", () => {
  it("releases a lock", () => {
    let session = joinSession(makeSession(), "u1", "Alice");
    session = acquireLock(session, "node-1", "u1", "editing").session;
    session = releaseLock(session, "node-1", "u1");
    expect(session.locks).toHaveLength(0);
  });

  it("ignores releasing someone else's lock", () => {
    let session = joinSession(makeSession(), "u1", "Alice");
    session = joinSession(session, "u2", "Bob");
    session = acquireLock(session, "node-1", "u1", "editing").session;
    session = releaseLock(session, "node-1", "u2"); // u2 tries to release u1's lock
    expect(session.locks).toHaveLength(1); // lock should remain
  });
});

describe("getNodeLock", () => {
  it("returns null for unlocked node", () => {
    expect(getNodeLock(makeSession(), "node-1")).toBeNull();
  });

  it("returns null for expired lock", () => {
    let session = joinSession(makeSession(), "u1", "Alice");
    const past = new Date(Date.now() - 10_000);
    session = acquireLock(session, "node-1", "u1", "editing", 1, past).session;
    expect(getNodeLock(session, "node-1")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// purgeExpiredLocks
// ─────────────────────────────────────────────────────────────────────────────

describe("purgeExpiredLocks", () => {
  it("removes expired locks", () => {
    let session = joinSession(makeSession(), "u1", "Alice");
    session = joinSession(session, "u2", "Bob");
    const past = new Date(Date.now() - 10_000);
    session = acquireLock(session, "n1", "u1", "editing", 1, past).session;
    session = acquireLock(session, "n2", "u2", "editing", 60_000).session;
    session = purgeExpiredLocks(session);
    expect(session.locks).toHaveLength(1);
    expect(session.locks[0].nodeId).toBe("n2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// canEdit
// ─────────────────────────────────────────────────────────────────────────────

describe("canEdit", () => {
  it("returns true for unlocked node", () => {
    const session = joinSession(makeSession(), "u1", "Alice");
    expect(canEdit(session, "node-1", "u1")).toBe(true);
  });

  it("returns true when user holds the lock", () => {
    let session = joinSession(makeSession(), "u1", "Alice");
    session = acquireLock(session, "n1", "u1", "editing").session;
    expect(canEdit(session, "n1", "u1")).toBe(true);
  });

  it("returns false when another user holds the lock", () => {
    let session = joinSession(makeSession(), "u1", "Alice");
    session = joinSession(session, "u2", "Bob");
    session = acquireLock(session, "n1", "u1", "editing").session;
    expect(canEdit(session, "n1", "u2")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// recordOperation / getRecentOperations
// ─────────────────────────────────────────────────────────────────────────────

describe("recordOperation", () => {
  it("records an operation", () => {
    let session = makeSession();
    session = recordOperation(session, makeOp());
    expect(session.operationHistory).toHaveLength(1);
    expect(session.operationHistory[0].id).toBeTruthy();
    expect(session.operationHistory[0].timestamp).toBeInstanceOf(Date);
  });

  it("trims history beyond maxHistorySize", () => {
    let session = createSession("wf-1", 3);
    for (let i = 0; i < 5; i++) {
      session = recordOperation(session, makeOp({ userId: `u${i}` }));
    }
    expect(session.operationHistory).toHaveLength(3);
  });
});

describe("getRecentOperations", () => {
  it("returns last N operations", () => {
    let session = makeSession();
    for (let i = 0; i < 10; i++) {
      session = recordOperation(session, makeOp({ userId: `u${i}` }));
    }
    const recent = getRecentOperations(session, 3);
    expect(recent).toHaveLength(3);
    expect(recent[2].userId).toBe("u9");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getOperationsByUser / getOperationsForNode
// ─────────────────────────────────────────────────────────────────────────────

describe("getOperationsByUser", () => {
  it("returns operations by specific user", () => {
    let session = makeSession();
    session = recordOperation(session, makeOp({ userId: "u1", nodeId: "n1" }));
    session = recordOperation(session, makeOp({ userId: "u2", nodeId: "n2" }));
    session = recordOperation(session, makeOp({ userId: "u1", nodeId: "n3" }));
    expect(getOperationsByUser(session, "u1")).toHaveLength(2);
    expect(getOperationsByUser(session, "u2")).toHaveLength(1);
  });
});

describe("getOperationsForNode", () => {
  it("returns operations for specific node", () => {
    let session = makeSession();
    session = recordOperation(session, makeOp({ nodeId: "n1" }));
    session = recordOperation(session, makeOp({ nodeId: "n2" }));
    session = recordOperation(session, makeOp({ nodeId: "n1", type: "node_move" }));
    expect(getOperationsForNode(session, "n1")).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// detectConflict
// ─────────────────────────────────────────────────────────────────────────────

describe("detectConflict", () => {
  const makeFullOp = (overrides: Partial<EditOperation> = {}): EditOperation => ({
    id: "op-1",
    type: "node_config",
    userId: "u1",
    nodeId: "n1",
    timestamp: new Date(),
    ...overrides,
  });

  it("detects conflict between concurrent config changes on same node", () => {
    const opA = makeFullOp({ userId: "u1" });
    const opB = makeFullOp({ userId: "u2", id: "op-2" });
    const result = detectConflict(opA, opB);
    expect(result.hasConflict).toBe(true);
    expect(result.conflictingUserId).toBe("u2");
  });

  it("no conflict for different nodes", () => {
    const opA = makeFullOp({ nodeId: "n1" });
    const opB = makeFullOp({ nodeId: "n2", id: "op-2", userId: "u2" });
    expect(detectConflict(opA, opB).hasConflict).toBe(false);
  });

  it("no conflict for same user", () => {
    const opA = makeFullOp();
    const opB = makeFullOp({ id: "op-2" });
    expect(detectConflict(opA, opB).hasConflict).toBe(false);
  });

  it("no conflict outside time window", () => {
    const opA = makeFullOp({ timestamp: new Date(Date.now() - 60_000) });
    const opB = makeFullOp({ id: "op-2", userId: "u2" });
    expect(detectConflict(opA, opB, 5000).hasConflict).toBe(false);
  });

  it("detects delete-while-editing conflict", () => {
    const opA = makeFullOp({ type: "node_delete", userId: "u1" });
    const opB = makeFullOp({ type: "node_config", userId: "u2", id: "op-2" });
    const result = detectConflict(opA, opB);
    expect(result.hasConflict).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getUsersOnNode / getCollaboratorCount
// ─────────────────────────────────────────────────────────────────────────────

describe("getUsersOnNode", () => {
  it("returns users selecting a node", () => {
    let session = joinSession(makeSession(), "u1", "Alice");
    session = joinSession(session, "u2", "Bob");
    session = updatePresence(session, "u1", { selectedNodeIds: ["n1"] });
    session = updatePresence(session, "u2", { selectedNodeIds: ["n2"] });
    expect(getUsersOnNode(session, "n1")).toHaveLength(1);
    expect(getUsersOnNode(session, "n1")[0].userId).toBe("u1");
  });

  it("excludes offline users", () => {
    let session = joinSession(makeSession(), "u1", "Alice");
    session = updatePresence(session, "u1", { selectedNodeIds: ["n1"], status: "offline" });
    expect(getUsersOnNode(session, "n1")).toHaveLength(0);
  });
});

describe("getCollaboratorCount", () => {
  it("counts non-offline participants", () => {
    let session = joinSession(makeSession(), "u1", "Alice");
    session = joinSession(session, "u2", "Bob");
    session = updatePresence(session, "u2", { status: "offline" });
    expect(getCollaboratorCount(session)).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getSessionSummary
// ─────────────────────────────────────────────────────────────────────────────

describe("getSessionSummary", () => {
  it("returns correct summary", () => {
    let session = joinSession(makeSession(), "u1", "Alice");
    session = joinSession(session, "u2", "Bob");
    session = updatePresence(session, "u2", { status: "idle" });
    session = acquireLock(session, "n1", "u1", "editing").session;
    session = recordOperation(session, makeOp());

    const summary = getSessionSummary(session);
    expect(summary.workflowId).toBe("wf-1");
    expect(summary.activeUsers).toBe(1);
    expect(summary.idleUsers).toBe(1);
    expect(summary.activeLocks).toBe(1);
    expect(summary.recentOperations).toBe(1);
    expect(summary.participants).toHaveLength(2);
  });
});
