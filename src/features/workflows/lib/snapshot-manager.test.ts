import { describe, it, expect, beforeEach } from "vitest";
import {
  createSnapshot,
  createStore,
  addSnapshot,
  pruneSnapshots,
  getSnapshot,
  getLatestSnapshot,
  getSnapshotsByTrigger,
  getSnapshotsByTag,
  archiveSnapshot,
  deleteSnapshot,
  diffSnapshots,
  isIdentical,
  restoreSnapshot,
  labelSnapshot,
  tagSnapshot,
  getStoreStats,
  findByParent,
  resetSnapSeq,
} from "./snapshot-manager";

const NOW = 1_700_000_000_000;
const DATA1 = { name: "Test Workflow", nodes: ["a", "b"], version: 1 };
const DATA2 = { name: "Test Workflow", nodes: ["a", "b", "c"], version: 2 };

beforeEach(() => {
  resetSnapSeq();
});

// ─────────────────────────────────────────────────────────────────────────────
// createSnapshot
// ─────────────────────────────────────────────────────────────────────────────

describe("createSnapshot", () => {
  it("creates snapshot with auto-id", () => {
    const s = createSnapshot("wf1", DATA1, {}, NOW);
    expect(s.id).toBe("snap_1");
    expect(s.workflowId).toBe("wf1");
    expect(s.status).toBe("active");
    expect(s.trigger).toBe("manual");
    expect(s.tags).toEqual([]);
    expect(s.checksum).toMatch(/^csum_/);
    expect(s.sizeBytes).toBeGreaterThan(0);
    expect(s.createdAt).toBe(NOW);
  });

  it("stores data reference", () => {
    const s = createSnapshot("wf1", DATA1, {}, NOW);
    expect(s.data).toEqual(DATA1);
  });

  it("applies options", () => {
    const s = createSnapshot("wf1", DATA1, {
      label: "pre-deploy",
      trigger: "pre_deploy",
      tags: ["release"],
      parentId: "snap_0",
    }, NOW);
    expect(s.label).toBe("pre-deploy");
    expect(s.trigger).toBe("pre_deploy");
    expect(s.tags).toContain("release");
    expect(s.parentId).toBe("snap_0");
  });

  it("increments version", () => {
    const s1 = createSnapshot("wf1", DATA1, {}, NOW);
    const s2 = createSnapshot("wf1", DATA2, {}, NOW);
    expect(s2.version).toBeGreaterThan(s1.version);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createStore / addSnapshot / pruneSnapshots
// ─────────────────────────────────────────────────────────────────────────────

describe("createStore", () => {
  it("creates empty store", () => {
    const store = createStore("wf1", 10);
    expect(store.snapshots).toHaveLength(0);
    expect(store.maxSnapshots).toBe(10);
  });
});

describe("addSnapshot", () => {
  it("adds snapshot", () => {
    let store = createStore("wf1");
    store = addSnapshot(store, createSnapshot("wf1", DATA1, {}, NOW));
    expect(store.snapshots).toHaveLength(1);
  });

  it("is immutable", () => {
    const original = createStore("wf1");
    addSnapshot(original, createSnapshot("wf1", DATA1, {}, NOW));
    expect(original.snapshots).toHaveLength(0);
  });
});

describe("pruneSnapshots", () => {
  it("archives oldest active when over maxSnapshots", () => {
    let store = createStore("wf1", 2);
    store = addSnapshot(store, createSnapshot("wf1", DATA1, {}, NOW));
    store = addSnapshot(store, createSnapshot("wf1", DATA1, {}, NOW));
    store = addSnapshot(store, createSnapshot("wf1", DATA2, {}, NOW)); // 3rd active
    store = pruneSnapshots(store);
    const active = store.snapshots.filter((s) => s.status === "active");
    const archived = store.snapshots.filter((s) => s.status === "archived");
    expect(active).toHaveLength(2);
    expect(archived).toHaveLength(1);
  });

  it("no-op when within limit", () => {
    let store = createStore("wf1", 5);
    store = addSnapshot(store, createSnapshot("wf1", DATA1, {}, NOW));
    const pruned = pruneSnapshots(store);
    expect(pruned.snapshots[0].status).toBe("active");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getSnapshot / getLatestSnapshot / getSnapshotsByTrigger / getSnapshotsByTag
// ─────────────────────────────────────────────────────────────────────────────

describe("getSnapshot", () => {
  it("finds by id", () => {
    let store = createStore("wf1");
    const s = createSnapshot("wf1", DATA1, {}, NOW);
    store = addSnapshot(store, s);
    expect(getSnapshot(store, s.id)?.id).toBe(s.id);
  });

  it("returns undefined for missing", () => {
    expect(getSnapshot(createStore("wf1"), "missing")).toBeUndefined();
  });
});

describe("getLatestSnapshot", () => {
  it("returns last active snapshot", () => {
    let store = createStore("wf1");
    store = addSnapshot(store, createSnapshot("wf1", DATA1, {}, NOW));
    store = addSnapshot(store, createSnapshot("wf1", DATA2, {}, NOW + 1000));
    const latest = getLatestSnapshot(store);
    expect(latest?.data).toEqual(DATA2);
  });

  it("returns undefined for empty store", () => {
    expect(getLatestSnapshot(createStore("wf1"))).toBeUndefined();
  });
});

describe("getSnapshotsByTrigger", () => {
  it("filters by trigger", () => {
    let store = createStore("wf1");
    store = addSnapshot(store, createSnapshot("wf1", DATA1, { trigger: "auto" }, NOW));
    store = addSnapshot(store, createSnapshot("wf1", DATA2, { trigger: "manual" }, NOW));
    expect(getSnapshotsByTrigger(store, "auto")).toHaveLength(1);
    expect(getSnapshotsByTrigger(store, "manual")).toHaveLength(1);
  });
});

describe("getSnapshotsByTag", () => {
  it("filters by tag", () => {
    let store = createStore("wf1");
    store = addSnapshot(store, createSnapshot("wf1", DATA1, { tags: ["prod"] }, NOW));
    store = addSnapshot(store, createSnapshot("wf1", DATA2, { tags: ["staging"] }, NOW));
    expect(getSnapshotsByTag(store, "prod")).toHaveLength(1);
    expect(getSnapshotsByTag(store, "staging")).toHaveLength(1);
    expect(getSnapshotsByTag(store, "dev")).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// archiveSnapshot / deleteSnapshot
// ─────────────────────────────────────────────────────────────────────────────

describe("archiveSnapshot", () => {
  it("sets archived status and archivedAt", () => {
    let store = createStore("wf1");
    const s = createSnapshot("wf1", DATA1, {}, NOW);
    store = addSnapshot(store, s);
    store = archiveSnapshot(store, s.id, NOW + 1000);
    const archived = getSnapshot(store, s.id);
    expect(archived?.status).toBe("archived");
    expect(archived?.archivedAt).toBe(NOW + 1000);
  });
});

describe("deleteSnapshot", () => {
  it("sets deleted status", () => {
    let store = createStore("wf1");
    const s = createSnapshot("wf1", DATA1, {}, NOW);
    store = addSnapshot(store, s);
    store = deleteSnapshot(store, s.id);
    expect(getSnapshot(store, s.id)?.status).toBe("deleted");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// diffSnapshots / isIdentical / restoreSnapshot
// ─────────────────────────────────────────────────────────────────────────────

describe("diffSnapshots", () => {
  it("detects added, removed, changed, unchanged", () => {
    const s1 = createSnapshot("wf1", { a: 1, b: 2, c: 3 }, {}, NOW);
    const s2 = createSnapshot("wf1", { a: 1, b: 99, d: 4 }, {}, NOW); // c removed, d added, b changed, a unchanged
    const diff = diffSnapshots(s1, s2);
    expect(diff.added).toContain("d");
    expect(diff.removed).toContain("c");
    expect(diff.changed).toContain("b");
    expect(diff.unchanged).toContain("a");
    expect(diff.hasChanges).toBe(true);
  });

  it("no changes when identical", () => {
    const s1 = createSnapshot("wf1", { a: 1 }, {}, NOW);
    const s2 = createSnapshot("wf1", { a: 1 }, {}, NOW);
    expect(diffSnapshots(s1, s2).hasChanges).toBe(false);
  });
});

describe("isIdentical", () => {
  it("true for same data", () => {
    const s1 = createSnapshot("wf1", { a: 1 }, {}, NOW);
    const s2 = createSnapshot("wf1", { a: 1 }, {}, NOW);
    expect(isIdentical(s1, s2)).toBe(true);
  });

  it("false for different data", () => {
    const s1 = createSnapshot("wf1", { a: 1 }, {}, NOW);
    const s2 = createSnapshot("wf1", { a: 2 }, {}, NOW);
    expect(isIdentical(s1, s2)).toBe(false);
  });
});

describe("restoreSnapshot", () => {
  it("returns copy of data", () => {
    const s = createSnapshot("wf1", DATA1, {}, NOW);
    const restored = restoreSnapshot(s);
    expect(restored).toEqual(DATA1);
    // Immutable — mutating restored should not affect snapshot
    restored["mutated"] = true;
    expect(s.data["mutated"]).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// labelSnapshot / tagSnapshot
// ─────────────────────────────────────────────────────────────────────────────

describe("labelSnapshot", () => {
  it("sets label", () => {
    let store = createStore("wf1");
    const s = createSnapshot("wf1", DATA1, {}, NOW);
    store = addSnapshot(store, s);
    store = labelSnapshot(store, s.id, "v1.0");
    expect(getSnapshot(store, s.id)?.label).toBe("v1.0");
  });
});

describe("tagSnapshot", () => {
  it("adds tag", () => {
    let store = createStore("wf1");
    const s = createSnapshot("wf1", DATA1, {}, NOW);
    store = addSnapshot(store, s);
    store = tagSnapshot(store, s.id, "production");
    expect(getSnapshot(store, s.id)?.tags).toContain("production");
  });

  it("does not duplicate tags", () => {
    let store = createStore("wf1");
    const s = createSnapshot("wf1", DATA1, { tags: ["prod"] }, NOW);
    store = addSnapshot(store, s);
    store = tagSnapshot(store, s.id, "prod");
    expect(getSnapshot(store, s.id)?.tags.filter((t) => t === "prod")).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getStoreStats / findByParent
// ─────────────────────────────────────────────────────────────────────────────

describe("getStoreStats", () => {
  it("computes stats", () => {
    let store = createStore("wf1");
    store = addSnapshot(store, createSnapshot("wf1", DATA1, { trigger: "manual" }, NOW));
    store = addSnapshot(store, createSnapshot("wf1", DATA2, { trigger: "auto" }, NOW));
    const s3 = createSnapshot("wf1", DATA1, { trigger: "checkpoint" }, NOW);
    store = addSnapshot(store, s3);
    store = archiveSnapshot(store, s3.id, NOW + 1000);
    const stats = getStoreStats(store);
    expect(stats.total).toBe(3);
    expect(stats.active).toBe(2);
    expect(stats.archived).toBe(1);
    expect(stats.byTrigger.manual).toBe(1);
    expect(stats.byTrigger.auto).toBe(1);
    expect(stats.totalSizeBytes).toBeGreaterThan(0);
  });
});

describe("findByParent", () => {
  it("finds children", () => {
    let store = createStore("wf1");
    const parent = createSnapshot("wf1", DATA1, {}, NOW);
    store = addSnapshot(store, parent);
    store = addSnapshot(store, createSnapshot("wf1", DATA2, { parentId: parent.id }, NOW));
    store = addSnapshot(store, createSnapshot("wf1", DATA2, { parentId: parent.id }, NOW));
    expect(findByParent(store, parent.id)).toHaveLength(2);
  });
});
