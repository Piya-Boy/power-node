import { describe, it, expect } from "vitest";
import {
  computeChecksum,
  createSnapshot,
  buildSemver,
  parseSemver,
  diffSnapshots,
  diffPayloads,
  buildSnapshotIndex,
  findByTag,
  findByTrigger,
  getLatestSnapshot,
  sortByVersion,
  addTags,
  removeTags,
  setLabel,
  createRollbackSnapshot,
  validateChecksum,
  getRestoreChain,
  computeSnapshotStats,
  type WorkflowPayload,
  type WorkflowSnapshot,
} from "./snapshot-manager";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makePayload(overrides: Partial<WorkflowPayload> = {}): WorkflowPayload {
  return {
    name: "My Workflow",
    description: "A test workflow",
    settings: { timeout: 30 },
    nodes: [
      { id: "n1", type: "trigger", position: { x: 0, y: 0 }, data: { event: "webhook" } },
      { id: "n2", type: "action", position: { x: 200, y: 0 }, data: { method: "POST" } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2" },
    ],
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<WorkflowSnapshot> = {}): WorkflowSnapshot {
  const payload = makePayload();
  return {
    id: "snap_wf1_v1",
    workflowId: "wf1",
    version: 1,
    semver: "1.0.0",
    trigger: "manual",
    createdAt: new Date("2025-01-01T00:00:00Z"),
    createdBy: "user1",
    tags: [],
    checksum: computeChecksum(payload),
    payload,
    changeCategory: "structural",
    changeSummary: "Initial snapshot",
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// computeChecksum
// ─────────────────────────────────────────────────────────────────────────────

describe("computeChecksum", () => {
  it("returns a non-empty string", () => {
    const checksum = computeChecksum(makePayload());
    expect(checksum).toBeTruthy();
    expect(typeof checksum).toBe("string");
  });

  it("is deterministic for the same payload", () => {
    const p = makePayload();
    expect(computeChecksum(p)).toBe(computeChecksum(p));
  });

  it("is stable regardless of node array order", () => {
    const p1 = makePayload();
    const p2 = makePayload({ nodes: [...p1.nodes].reverse() });
    expect(computeChecksum(p1)).toBe(computeChecksum(p2));
  });

  it("differs when node data changes", () => {
    const p1 = makePayload();
    const p2 = makePayload({
      nodes: [
        { id: "n1", type: "trigger", position: { x: 0, y: 0 }, data: { event: "schedule" } },
        { id: "n2", type: "action", position: { x: 200, y: 0 }, data: { method: "POST" } },
      ],
    });
    expect(computeChecksum(p1)).not.toBe(computeChecksum(p2));
  });

  it("differs when a node is added", () => {
    const p1 = makePayload();
    const p2 = makePayload({
      nodes: [...p1.nodes, { id: "n3", type: "filter", position: { x: 400, y: 0 }, data: {} }],
    });
    expect(computeChecksum(p1)).not.toBe(computeChecksum(p2));
  });

  it("is insensitive to position changes (position excluded from hash)", () => {
    const p1 = makePayload();
    const p2 = makePayload({
      nodes: [
        { id: "n1", type: "trigger", position: { x: 999, y: 999 }, data: { event: "webhook" } },
        { id: "n2", type: "action", position: { x: 999, y: 999 }, data: { method: "POST" } },
      ],
    });
    // Position is excluded from checksum — checksums should be equal
    expect(computeChecksum(p1)).toBe(computeChecksum(p2));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildSemver / parseSemver
// ─────────────────────────────────────────────────────────────────────────────

describe("buildSemver", () => {
  it("version 1 → 1.0.0", () => expect(buildSemver(1)).toBe("1.0.0"));
  it("version 2 → 1.1.0", () => expect(buildSemver(2)).toBe("1.1.0"));
  it("version 10 → 1.9.0", () => expect(buildSemver(10)).toBe("1.9.0"));
  it("version 11 → 2.0.0", () => expect(buildSemver(11)).toBe("2.0.0"));
  it("version 20 → 2.9.0", () => expect(buildSemver(20)).toBe("2.9.0"));
  it("version 0 → 0.0.0", () => expect(buildSemver(0)).toBe("0.0.0"));
});

describe("parseSemver", () => {
  it("1.0.0 → 1", () => expect(parseSemver("1.0.0")).toBe(1));
  it("1.1.0 → 2", () => expect(parseSemver("1.1.0")).toBe(2));
  it("2.0.0 → 11", () => expect(parseSemver("2.0.0")).toBe(11));
  it("returns null for invalid format", () => expect(parseSemver("invalid")).toBeNull());
  it("roundtrips: parseSemver(buildSemver(v)) === v", () => {
    for (const v of [1, 5, 10, 11, 20, 21]) {
      expect(parseSemver(buildSemver(v))).toBe(v);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createSnapshot
// ─────────────────────────────────────────────────────────────────────────────

describe("createSnapshot", () => {
  it("creates a snapshot with correct fields", () => {
    const payload = makePayload();
    const snap = createSnapshot({
      workflowId: "wf1",
      version: 1,
      trigger: "manual",
      createdBy: "user1",
      payload,
    });
    expect(snap.workflowId).toBe("wf1");
    expect(snap.version).toBe(1);
    expect(snap.semver).toBe("1.0.0");
    expect(snap.trigger).toBe("manual");
    expect(snap.createdBy).toBe("user1");
    expect(snap.checksum).toBe(computeChecksum(payload));
  });

  it("sets changeCategory to structural for first snapshot", () => {
    const snap = createSnapshot({ workflowId: "wf1", version: 1, trigger: "manual", createdBy: "u1", payload: makePayload() });
    expect(snap.changeCategory).toBe("structural");
    expect(snap.changeSummary).toBe("Initial snapshot");
  });

  it("sets changeCategory based on parent diff", () => {
    const payload1 = makePayload();
    const parent = createSnapshot({ workflowId: "wf1", version: 1, trigger: "manual", createdBy: "u1", payload: payload1 });
    const payload2 = makePayload({ name: "Renamed Workflow" });
    const snap = createSnapshot({ workflowId: "wf1", version: 2, trigger: "manual", createdBy: "u1", payload: payload2, parentSnapshot: parent });
    expect(snap.changeCategory).toBe("metadata");
    expect(snap.parentId).toBe(parent.id);
  });

  it("includes label and tags when provided", () => {
    const snap = createSnapshot({
      workflowId: "wf1", version: 3, trigger: "pre-publish", createdBy: "u1",
      payload: makePayload(), label: "Release candidate", tags: ["rc", "v3"],
    });
    expect(snap.label).toBe("Release candidate");
    expect(snap.tags).toContain("rc");
    expect(snap.tags).toContain("v3");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// diffSnapshots / diffPayloads
// ─────────────────────────────────────────────────────────────────────────────

describe("diffSnapshots", () => {
  it("reports no changes when payloads are identical", () => {
    const snap1 = makeSnapshot({ version: 1 });
    const snap2 = makeSnapshot({ version: 2, id: "snap_wf1_v2" });
    const diff = diffSnapshots(snap1, snap2);
    expect(diff.changeCategory).toBe("none");
    expect(diff.nodesAdded).toHaveLength(0);
    expect(diff.nodesRemoved).toHaveLength(0);
  });

  it("detects added nodes as structural change", () => {
    const snap1 = makeSnapshot({ version: 1 });
    const newPayload = makePayload({
      nodes: [...makePayload().nodes, { id: "n3", type: "filter", position: { x: 400, y: 0 }, data: {} }],
    });
    const snap2 = makeSnapshot({ version: 2, id: "snap_wf1_v2", payload: newPayload, checksum: computeChecksum(newPayload) });
    const diff = diffSnapshots(snap1, snap2);
    expect(diff.changeCategory).toBe("structural");
    expect(diff.nodesAdded).toContain("n3");
  });

  it("detects removed nodes", () => {
    const snap1 = makeSnapshot({ version: 1 });
    const newPayload = makePayload({ nodes: [makePayload().nodes[0]] });
    const snap2 = makeSnapshot({ version: 2, id: "snap_wf1_v2", payload: newPayload, checksum: computeChecksum(newPayload) });
    const diff = diffSnapshots(snap1, snap2);
    expect(diff.nodesRemoved).toContain("n2");
  });

  it("detects modified node config", () => {
    const snap1 = makeSnapshot({ version: 1 });
    const newPayload = makePayload({
      nodes: [
        { id: "n1", type: "trigger", position: { x: 0, y: 0 }, data: { event: "schedule" } },
        { id: "n2", type: "action", position: { x: 200, y: 0 }, data: { method: "POST" } },
      ],
    });
    const snap2 = makeSnapshot({ version: 2, id: "snap_wf1_v2", payload: newPayload, checksum: computeChecksum(newPayload) });
    const diff = diffSnapshots(snap1, snap2);
    expect(diff.changeCategory).toBe("config");
    expect(diff.nodesModified).toContain("n1");
  });

  it("detects settings changes", () => {
    const snap1 = makeSnapshot({ version: 1 });
    const newPayload = makePayload({ settings: { timeout: 60 } });
    const snap2 = makeSnapshot({ version: 2, id: "snap_wf1_v2", payload: newPayload, checksum: computeChecksum(newPayload) });
    const diff = diffSnapshots(snap1, snap2);
    expect(diff.changeCategory).toBe("settings");
    expect(diff.settingsChanged).toContain("timeout");
  });

  it("detects metadata changes (name)", () => {
    const snap1 = makeSnapshot({ version: 1 });
    const newPayload = makePayload({ name: "New Name" });
    const snap2 = makeSnapshot({ version: 2, id: "snap_wf1_v2", payload: newPayload, checksum: computeChecksum(newPayload) });
    const diff = diffSnapshots(snap1, snap2);
    expect(diff.changeCategory).toBe("metadata");
    expect(diff.metadataChanged).toContain("name");
  });

  it("includes fromVersion and toVersion", () => {
    const snap1 = makeSnapshot({ version: 3 });
    const snap2 = makeSnapshot({ version: 7, id: "snap_wf1_v7" });
    const diff = diffSnapshots(snap1, snap2);
    expect(diff.fromVersion).toBe(3);
    expect(diff.toVersion).toBe(7);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildSnapshotIndex
// ─────────────────────────────────────────────────────────────────────────────

describe("buildSnapshotIndex", () => {
  it("returns empty index for no snapshots", () => {
    const idx = buildSnapshotIndex([]);
    expect(idx.workflowId).toBe("");
    expect(idx.snapshots).toHaveLength(0);
  });

  it("captures workflowId from first snapshot", () => {
    const idx = buildSnapshotIndex([makeSnapshot()]);
    expect(idx.workflowId).toBe("wf1");
  });

  it("strips payload from index entries", () => {
    const idx = buildSnapshotIndex([makeSnapshot()]);
    expect((idx.snapshots[0] as unknown as Record<string, unknown>).payload).toBeUndefined();
  });

  it("preserves id, version, semver, trigger", () => {
    const snap = makeSnapshot({ version: 5, semver: "1.4.0", trigger: "pre-publish" });
    const idx = buildSnapshotIndex([snap]);
    expect(idx.snapshots[0].version).toBe(5);
    expect(idx.snapshots[0].semver).toBe("1.4.0");
    expect(idx.snapshots[0].trigger).toBe("pre-publish");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// findByTag / findByTrigger
// ─────────────────────────────────────────────────────────────────────────────

describe("findByTag", () => {
  const snaps = [
    makeSnapshot({ id: "s1", version: 1, tags: ["stable", "v1"] }),
    makeSnapshot({ id: "s2", version: 2, tags: ["rc"] }),
    makeSnapshot({ id: "s3", version: 3, tags: ["stable"] }),
  ];

  it("finds by matching tag", () => {
    const found = findByTag(snaps, "stable");
    expect(found).toHaveLength(2);
    expect(found.map((s) => s.id)).toContain("s1");
    expect(found.map((s) => s.id)).toContain("s3");
  });

  it("returns empty when no matches", () => {
    expect(findByTag(snaps, "nope")).toHaveLength(0);
  });
});

describe("findByTrigger", () => {
  const snaps = [
    makeSnapshot({ id: "s1", version: 1, trigger: "manual" }),
    makeSnapshot({ id: "s2", version: 2, trigger: "auto-save" }),
    makeSnapshot({ id: "s3", version: 3, trigger: "manual" }),
  ];

  it("finds by trigger", () => {
    const found = findByTrigger(snaps, "manual");
    expect(found).toHaveLength(2);
  });

  it("returns empty when no matches", () => {
    expect(findByTrigger(snaps, "rollback")).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getLatestSnapshot / sortByVersion
// ─────────────────────────────────────────────────────────────────────────────

describe("getLatestSnapshot", () => {
  it("returns null for empty list", () => {
    expect(getLatestSnapshot([])).toBeNull();
  });

  it("returns snapshot with highest version", () => {
    const snaps = [
      makeSnapshot({ id: "s1", version: 3 }),
      makeSnapshot({ id: "s2", version: 7 }),
      makeSnapshot({ id: "s3", version: 2 }),
    ];
    expect(getLatestSnapshot(snaps)?.version).toBe(7);
  });
});

describe("sortByVersion", () => {
  const snaps = [
    makeSnapshot({ id: "s1", version: 3 }),
    makeSnapshot({ id: "s2", version: 1 }),
    makeSnapshot({ id: "s3", version: 2 }),
  ];

  it("sorts descending by default", () => {
    const sorted = sortByVersion(snaps);
    expect(sorted.map((s) => s.version)).toEqual([3, 2, 1]);
  });

  it("sorts ascending when specified", () => {
    const sorted = sortByVersion(snaps, "asc");
    expect(sorted.map((s) => s.version)).toEqual([1, 2, 3]);
  });

  it("does not mutate original array", () => {
    const copy = [...snaps];
    sortByVersion(snaps);
    expect(snaps).toEqual(copy);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// addTags / removeTags / setLabel
// ─────────────────────────────────────────────────────────────────────────────

describe("addTags", () => {
  it("adds new tags", () => {
    const s = makeSnapshot({ tags: ["existing"] });
    const updated = addTags(s, ["new1", "new2"]);
    expect(updated.tags).toContain("existing");
    expect(updated.tags).toContain("new1");
    expect(updated.tags).toContain("new2");
  });

  it("deduplicates tags", () => {
    const s = makeSnapshot({ tags: ["dup"] });
    const updated = addTags(s, ["dup"]);
    expect(updated.tags.filter((t) => t === "dup")).toHaveLength(1);
  });

  it("does not mutate original", () => {
    const s = makeSnapshot({ tags: [] });
    addTags(s, ["new"]);
    expect(s.tags).toHaveLength(0);
  });
});

describe("removeTags", () => {
  it("removes specified tags", () => {
    const s = makeSnapshot({ tags: ["a", "b", "c"] });
    const updated = removeTags(s, ["b"]);
    expect(updated.tags).not.toContain("b");
    expect(updated.tags).toContain("a");
    expect(updated.tags).toContain("c");
  });

  it("ignores tags that are not present", () => {
    const s = makeSnapshot({ tags: ["a"] });
    const updated = removeTags(s, ["b"]);
    expect(updated.tags).toEqual(["a"]);
  });
});

describe("setLabel", () => {
  it("sets the label", () => {
    const s = makeSnapshot();
    const updated = setLabel(s, "Production Release");
    expect(updated.label).toBe("Production Release");
  });

  it("does not mutate original", () => {
    const s = makeSnapshot();
    setLabel(s, "New Label");
    expect(s.label).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateChecksum
// ─────────────────────────────────────────────────────────────────────────────

describe("validateChecksum", () => {
  it("returns true when checksum matches payload", () => {
    expect(validateChecksum(makeSnapshot())).toBe(true);
  });

  it("returns false when checksum is tampered", () => {
    const s = makeSnapshot({ checksum: "deadbeef" });
    expect(validateChecksum(s)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createRollbackSnapshot
// ─────────────────────────────────────────────────────────────────────────────

describe("createRollbackSnapshot", () => {
  it("creates a rollback snapshot with incremented version", () => {
    const target = makeSnapshot({ version: 3, semver: "1.2.0" });
    const rollback = createRollbackSnapshot({ targetSnapshot: target, latestVersion: 10, performedBy: "admin" });
    expect(rollback.version).toBe(11);
    expect(rollback.trigger).toBe("rollback");
    expect(rollback.createdBy).toBe("admin");
  });

  it("restores the target payload", () => {
    const target = makeSnapshot({ version: 3 });
    const rollback = createRollbackSnapshot({ targetSnapshot: target, latestVersion: 5, performedBy: "admin" });
    expect(rollback.payload).toEqual(target.payload);
  });

  it("includes rollback tag and from-version tag", () => {
    const target = makeSnapshot({ version: 2, semver: "1.1.0" });
    const rollback = createRollbackSnapshot({ targetSnapshot: target, latestVersion: 5, performedBy: "admin" });
    expect(rollback.tags).toContain("rollback");
    expect(rollback.tags).toContain("from-v1.1.0");
  });

  it("sets a descriptive label", () => {
    const target = makeSnapshot({ version: 2, semver: "1.1.0" });
    const rollback = createRollbackSnapshot({ targetSnapshot: target, latestVersion: 5, performedBy: "admin" });
    expect(rollback.label).toContain("1.1.0");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getRestoreChain
// ─────────────────────────────────────────────────────────────────────────────

describe("getRestoreChain", () => {
  it("returns just the snapshot when no parent", () => {
    const s = makeSnapshot({ id: "s1" });
    const chain = getRestoreChain(s, [s]);
    expect(chain).toHaveLength(1);
    expect(chain[0].id).toBe("s1");
  });

  it("follows parent chain to root", () => {
    const s1 = makeSnapshot({ id: "s1", version: 1 });
    const s2 = makeSnapshot({ id: "s2", version: 2, parentId: "s1" });
    const s3 = makeSnapshot({ id: "s3", version: 3, parentId: "s2" });
    const chain = getRestoreChain(s3, [s1, s2, s3]);
    expect(chain.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("stops at missing parent", () => {
    const s2 = makeSnapshot({ id: "s2", version: 2, parentId: "s1-missing" });
    const chain = getRestoreChain(s2, [s2]);
    expect(chain).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeSnapshotStats
// ─────────────────────────────────────────────────────────────────────────────

describe("computeSnapshotStats", () => {
  it("returns zeroed stats for empty list", () => {
    const stats = computeSnapshotStats([]);
    expect(stats.total).toBe(0);
    expect(stats.latestVersion).toBe(0);
    expect(stats.oldestCreatedAt).toBeNull();
    expect(stats.latestCreatedAt).toBeNull();
    expect(stats.uniqueContributors).toHaveLength(0);
  });

  it("counts by trigger", () => {
    const snaps = [
      makeSnapshot({ id: "s1", version: 1, trigger: "manual" }),
      makeSnapshot({ id: "s2", version: 2, trigger: "auto-save" }),
      makeSnapshot({ id: "s3", version: 3, trigger: "manual" }),
    ];
    const stats = computeSnapshotStats(snaps);
    expect(stats.byTrigger.manual).toBe(2);
    expect(stats.byTrigger["auto-save"]).toBe(1);
    expect(stats.rollbackCount).toBe(0);
  });

  it("tracks rollback count", () => {
    const snaps = [
      makeSnapshot({ id: "s1", version: 1, trigger: "rollback" }),
      makeSnapshot({ id: "s2", version: 2, trigger: "rollback" }),
    ];
    expect(computeSnapshotStats(snaps).rollbackCount).toBe(2);
  });

  it("finds latest version", () => {
    const snaps = [
      makeSnapshot({ id: "s1", version: 5 }),
      makeSnapshot({ id: "s2", version: 3 }),
      makeSnapshot({ id: "s3", version: 12 }),
    ];
    expect(computeSnapshotStats(snaps).latestVersion).toBe(12);
  });

  it("collects unique contributors", () => {
    const snaps = [
      makeSnapshot({ id: "s1", version: 1, createdBy: "alice" }),
      makeSnapshot({ id: "s2", version: 2, createdBy: "bob" }),
      makeSnapshot({ id: "s3", version: 3, createdBy: "alice" }),
    ];
    const stats = computeSnapshotStats(snaps);
    expect(stats.uniqueContributors).toHaveLength(2);
    expect(stats.uniqueContributors).toContain("alice");
    expect(stats.uniqueContributors).toContain("bob");
  });

  it("counts by changeCategory", () => {
    const snaps = [
      makeSnapshot({ id: "s1", version: 1, changeCategory: "structural" }),
      makeSnapshot({ id: "s2", version: 2, changeCategory: "config" }),
      makeSnapshot({ id: "s3", version: 3, changeCategory: "structural" }),
    ];
    const stats = computeSnapshotStats(snaps);
    expect(stats.byChangeCategory.structural).toBe(2);
    expect(stats.byChangeCategory.config).toBe(1);
  });

  it("sets oldest/latest createdAt", () => {
    const snaps = [
      makeSnapshot({ id: "s1", version: 1, createdAt: new Date("2025-01-01") }),
      makeSnapshot({ id: "s2", version: 2, createdAt: new Date("2025-06-01") }),
      makeSnapshot({ id: "s3", version: 3, createdAt: new Date("2025-03-01") }),
    ];
    const stats = computeSnapshotStats(snaps);
    expect(stats.oldestCreatedAt?.toISOString()).toContain("2025-01-01");
    expect(stats.latestCreatedAt?.toISOString()).toContain("2025-06-01");
  });
});
