import { describe, it, expect, beforeEach } from "vitest";
import {
  createChangeRecord,
  resetChangeIdSeq,
  diffObjects,
  getWorkflowChanges,
  getAuthorChanges,
  getTargetChanges,
  getChangesInWindow,
  getRecentChanges,
  getChangesForField,
  groupChangesBySession,
  replayChanges,
  getFieldAtTime,
  buildChangelog,
  computeChangeStats,
  type ChangeRecord,
} from "./change-feed";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => resetChangeIdSeq());

function makeRecord(overrides: Partial<ChangeRecord> = {}): ChangeRecord {
  return createChangeRecord({
    workflowId: "wf1",
    authorId: "user1",
    operation: "update",
    target: "node",
    targetId: "n1",
    changes: [{ field: "label", before: "old", after: "new" }],
    timestamp: new Date("2025-06-01T10:00:00Z"),
    ...overrides,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// createChangeRecord
// ─────────────────────────────────────────────────────────────────────────────

describe("createChangeRecord", () => {
  it("creates with auto-id", () => {
    const r = makeRecord();
    expect(r.id).toBe("chg_1");
  });

  it("increments id", () => {
    expect(makeRecord().id).toBe("chg_1");
    expect(makeRecord().id).toBe("chg_2");
  });

  it("uses provided id", () => {
    expect(makeRecord({ id: "custom" }).id).toBe("custom");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// diffObjects
// ─────────────────────────────────────────────────────────────────────────────

describe("diffObjects", () => {
  it("detects changed fields", () => {
    const changes = diffObjects({ a: 1, b: 2 }, { a: 1, b: 99 });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toEqual({ field: "b", before: 2, after: 99 });
  });

  it("detects added fields", () => {
    const changes = diffObjects({}, { newField: "hello" });
    expect(changes).toHaveLength(1);
    expect(changes[0].field).toBe("newField");
    expect(changes[0].before).toBeUndefined();
  });

  it("detects removed fields", () => {
    const changes = diffObjects({ gone: true }, {});
    expect(changes).toHaveLength(1);
    expect(changes[0].after).toBeUndefined();
  });

  it("ignores specified keys", () => {
    const changes = diffObjects({ a: 1, updatedAt: "old" }, { a: 2, updatedAt: "new" }, ["updatedAt"]);
    expect(changes).toHaveLength(1);
    expect(changes[0].field).toBe("a");
  });

  it("returns empty for identical objects", () => {
    expect(diffObjects({ x: 1 }, { x: 1 })).toHaveLength(0);
  });

  it("handles nested object comparison", () => {
    const changes = diffObjects({ obj: { a: 1 } }, { obj: { a: 1 } });
    expect(changes).toHaveLength(0);
  });

  it("detects nested object changes", () => {
    const changes = diffObjects({ obj: { a: 1 } }, { obj: { a: 2 } });
    expect(changes).toHaveLength(1);
  });

  it("detects array changes", () => {
    const changes = diffObjects({ arr: [1, 2] }, { arr: [1, 3] });
    expect(changes).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getWorkflowChanges / getAuthorChanges / getTargetChanges
// ─────────────────────────────────────────────────────────────────────────────

describe("getWorkflowChanges", () => {
  it("filters by workflow", () => {
    const records = [makeRecord({ workflowId: "wf1" }), makeRecord({ workflowId: "wf2" })];
    expect(getWorkflowChanges(records, "wf1")).toHaveLength(1);
  });
});

describe("getAuthorChanges", () => {
  it("filters by author", () => {
    const records = [makeRecord({ authorId: "u1" }), makeRecord({ authorId: "u2" })];
    expect(getAuthorChanges(records, "u1")).toHaveLength(1);
  });
});

describe("getTargetChanges", () => {
  it("filters by target type", () => {
    const records = [
      makeRecord({ target: "node", targetId: "n1" }),
      makeRecord({ target: "edge", targetId: "e1" }),
    ];
    expect(getTargetChanges(records, "node")).toHaveLength(1);
  });

  it("filters by target id", () => {
    const records = [
      makeRecord({ target: "node", targetId: "n1" }),
      makeRecord({ target: "node", targetId: "n2" }),
    ];
    expect(getTargetChanges(records, "node", "n1")).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getChangesInWindow / getRecentChanges / getChangesForField
// ─────────────────────────────────────────────────────────────────────────────

describe("getChangesInWindow", () => {
  it("returns records within window", () => {
    const records = [
      makeRecord({ timestamp: new Date("2025-06-01T08:00:00Z") }),
      makeRecord({ timestamp: new Date("2025-06-01T12:00:00Z") }),
      makeRecord({ timestamp: new Date("2025-06-01T16:00:00Z") }),
    ];
    const result = getChangesInWindow(
      records,
      new Date("2025-06-01T10:00:00Z"),
      new Date("2025-06-01T14:00:00Z")
    );
    expect(result).toHaveLength(1);
  });
});

describe("getRecentChanges", () => {
  it("returns N most recent", () => {
    const records = [
      makeRecord({ timestamp: new Date("2025-06-01") }),
      makeRecord({ timestamp: new Date("2025-06-03") }),
      makeRecord({ timestamp: new Date("2025-06-02") }),
    ];
    const recent = getRecentChanges(records, 2);
    expect(recent).toHaveLength(2);
    expect(recent[0].timestamp.toISOString().startsWith("2025-06-03")).toBe(true);
  });
});

describe("getChangesForField", () => {
  it("returns records modifying a specific field", () => {
    const records = [
      makeRecord({ changes: [{ field: "label", before: "a", after: "b" }] }),
      makeRecord({ changes: [{ field: "color", before: "red", after: "blue" }] }),
    ];
    expect(getChangesForField(records, "label")).toHaveLength(1);
    expect(getChangesForField(records, "color")).toHaveLength(1);
    expect(getChangesForField(records, "missing")).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// groupChangesBySession
// ─────────────────────────────────────────────────────────────────────────────

describe("groupChangesBySession", () => {
  it("groups consecutive same-author records", () => {
    const t0 = new Date("2025-06-01T10:00:00Z").getTime();
    const records = [
      makeRecord({ timestamp: new Date(t0), authorId: "u1" }),
      makeRecord({ timestamp: new Date(t0 + 60_000), authorId: "u1" }), // 1 min later
      makeRecord({ timestamp: new Date(t0 + 400_000), authorId: "u1" }), // 6+ min later → new group
    ];
    const groups = groupChangesBySession(records, 300_000);
    expect(groups).toHaveLength(2);
    expect(groups[0].records).toHaveLength(2);
    expect(groups[1].records).toHaveLength(1);
  });

  it("splits groups by different author", () => {
    const t0 = new Date("2025-06-01T10:00:00Z").getTime();
    const records = [
      makeRecord({ timestamp: new Date(t0), authorId: "u1" }),
      makeRecord({ timestamp: new Date(t0 + 1_000), authorId: "u2" }),
    ];
    const groups = groupChangesBySession(records, 300_000);
    expect(groups).toHaveLength(2);
  });

  it("handles empty records", () => {
    expect(groupChangesBySession([])).toHaveLength(0);
  });

  it("includes a human summary", () => {
    const records = [makeRecord({ operation: "update", target: "node" })];
    const [group] = groupChangesBySession(records);
    expect(group.summary).toContain("update");
    expect(group.summary).toContain("node");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// replayChanges
// ─────────────────────────────────────────────────────────────────────────────

describe("replayChanges", () => {
  it("applies update records in order", () => {
    const t0 = new Date("2025-06-01T10:00:00Z").getTime();
    const records = [
      makeRecord({ timestamp: new Date(t0), targetId: "n1", changes: [{ field: "label", before: "init", after: "v1" }] }),
      makeRecord({ timestamp: new Date(t0 + 1000), targetId: "n1", changes: [{ field: "label", before: "v1", after: "v2" }] }),
    ];
    const result = replayChanges({ label: "init", color: "red" }, records, "n1");
    expect(result.label).toBe("v2");
    expect(result.color).toBe("red");
  });

  it("ignores records for other targetIds", () => {
    const records = [makeRecord({ targetId: "n99", changes: [{ field: "x", before: 1, after: 2 }] })];
    const result = replayChanges({ x: 1 }, records, "n1");
    expect(result.x).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getFieldAtTime
// ─────────────────────────────────────────────────────────────────────────────

describe("getFieldAtTime", () => {
  it("returns field value at a point in time", () => {
    const t0 = new Date("2025-06-01T10:00:00Z").getTime();
    const records = [
      makeRecord({ timestamp: new Date(t0), targetId: "n1", changes: [{ field: "label", before: "a", after: "b" }] }),
      makeRecord({ timestamp: new Date(t0 + 5000), targetId: "n1", changes: [{ field: "label", before: "b", after: "c" }] }),
    ];
    expect(getFieldAtTime(records, "n1", "label", new Date(t0 + 1000))).toBe("b");
    expect(getFieldAtTime(records, "n1", "label", new Date(t0 + 6000))).toBe("c");
  });

  it("returns undefined when no change before asOf", () => {
    const t0 = new Date("2025-06-01T10:00:00Z").getTime();
    const records = [makeRecord({ timestamp: new Date(t0 + 5000), targetId: "n1", changes: [{ field: "x", before: 0, after: 1 }] })];
    expect(getFieldAtTime(records, "n1", "x", new Date(t0))).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildChangelog
// ─────────────────────────────────────────────────────────────────────────────

describe("buildChangelog", () => {
  it("groups by date newest first", () => {
    const records = [
      makeRecord({ timestamp: new Date("2025-06-01T10:00:00Z"), targetLabel: "Node A", operation: "create", target: "node" }),
      makeRecord({ timestamp: new Date("2025-06-02T09:00:00Z"), targetLabel: "Node B", operation: "delete", target: "node" }),
    ];
    const log = buildChangelog(records);
    expect(log[0].date).toBe("2025-06-02");
    expect(log[1].date).toBe("2025-06-01");
  });

  it("includes description", () => {
    const records = [makeRecord({ operation: "create", target: "node", targetLabel: "MyNode" })];
    const log = buildChangelog(records);
    expect(log[0].changes[0].description).toContain("MyNode");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeChangeStats
// ─────────────────────────────────────────────────────────────────────────────

describe("computeChangeStats", () => {
  it("returns zeros for empty", () => {
    const stats = computeChangeStats([]);
    expect(stats.totalChanges).toBe(0);
    expect(stats.lastChanged).toBeUndefined();
  });

  it("counts by operation", () => {
    const records = [
      makeRecord({ operation: "create" }),
      makeRecord({ operation: "update" }),
      makeRecord({ operation: "update" }),
    ];
    const stats = computeChangeStats(records);
    expect(stats.byOperation.create).toBe(1);
    expect(stats.byOperation.update).toBe(2);
  });

  it("counts by target", () => {
    const records = [
      makeRecord({ target: "node" }),
      makeRecord({ target: "edge" }),
      makeRecord({ target: "node" }),
    ];
    const stats = computeChangeStats(records);
    expect(stats.byTarget.node).toBe(2);
    expect(stats.byTarget.edge).toBe(1);
  });

  it("identifies most active authors", () => {
    const records = [
      makeRecord({ authorId: "u1" }),
      makeRecord({ authorId: "u1" }),
      makeRecord({ authorId: "u2" }),
    ];
    const stats = computeChangeStats(records);
    expect(stats.byAuthor[0].authorId).toBe("u1");
    expect(stats.byAuthor[0].count).toBe(2);
  });

  it("identifies most changed targets", () => {
    const records = [
      makeRecord({ target: "node", targetId: "n1" }),
      makeRecord({ target: "node", targetId: "n1" }),
      makeRecord({ target: "node", targetId: "n2" }),
    ];
    const stats = computeChangeStats(records);
    expect(stats.mostChangedTargetIds[0].targetId).toBe("n1");
    expect(stats.mostChangedTargetIds[0].count).toBe(2);
  });

  it("finds lastChanged", () => {
    const records = [
      makeRecord({ timestamp: new Date("2025-06-01") }),
      makeRecord({ timestamp: new Date("2025-06-03") }),
    ];
    const stats = computeChangeStats(records);
    expect(stats.lastChanged?.toISOString().startsWith("2025-06-03")).toBe(true);
  });
});
