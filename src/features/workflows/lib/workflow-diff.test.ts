import { describe, it, expect } from "vitest";
import {
  diffWorkflows,
  getNodeChanges,
  createSnapshot,
  applySnapshot,
  summarizeDiff,
  type WorkflowSnapshot,
  type SnapshotNode,
  type SnapshotConnection,
} from "./workflow-diff";

const makeNode = (
  id: string,
  overrides: Partial<SnapshotNode> = {},
): SnapshotNode => ({
  id,
  name: `Node ${id}`,
  type: "action",
  position: { x: 0, y: 0 },
  data: {},
  ...overrides,
});

const makeConnection = (
  id: string,
  overrides: Partial<SnapshotConnection> = {},
): SnapshotConnection => ({
  id,
  fromNodeId: "n1",
  toNodeId: "n2",
  fromOutput: "output",
  toInput: "input",
  ...overrides,
});

const makeSnapshot = (
  overrides: Partial<WorkflowSnapshot> = {},
): WorkflowSnapshot => ({
  id: "wf1",
  name: "Test Workflow",
  nodes: [],
  connections: [],
  createdAt: new Date("2024-01-01T00:00:00Z"),
  ...overrides,
});

describe("diffWorkflows", () => {
  it("should return no changes for identical snapshots", () => {
    const nodes = [makeNode("n1"), makeNode("n2")];
    const connections = [makeConnection("c1")];
    const before = makeSnapshot({ nodes, connections });
    const after = makeSnapshot({ nodes, connections });

    const diff = diffWorkflows(before, after);

    expect(diff.hasChanges).toBe(false);
    expect(diff.changeCount).toBe(0);
    expect(diff.addedNodes).toHaveLength(0);
    expect(diff.removedNodes).toHaveLength(0);
    expect(diff.modifiedNodes).toHaveLength(0);
    expect(diff.addedConnections).toHaveLength(0);
    expect(diff.removedConnections).toHaveLength(0);
  });

  it("should detect added nodes", () => {
    const n1 = makeNode("n1");
    const n2 = makeNode("n2");
    const before = makeSnapshot({ nodes: [n1] });
    const after = makeSnapshot({ nodes: [n1, n2] });

    const diff = diffWorkflows(before, after);

    expect(diff.hasChanges).toBe(true);
    expect(diff.addedNodes).toHaveLength(1);
    expect(diff.addedNodes[0].id).toBe("n2");
    expect(diff.removedNodes).toHaveLength(0);
    expect(diff.changeCount).toBe(1);
  });

  it("should detect removed nodes", () => {
    const n1 = makeNode("n1");
    const n2 = makeNode("n2");
    const before = makeSnapshot({ nodes: [n1, n2] });
    const after = makeSnapshot({ nodes: [n1] });

    const diff = diffWorkflows(before, after);

    expect(diff.hasChanges).toBe(true);
    expect(diff.removedNodes).toHaveLength(1);
    expect(diff.removedNodes[0].id).toBe("n2");
    expect(diff.addedNodes).toHaveLength(0);
  });

  it("should detect modified nodes", () => {
    const n1Before = makeNode("n1", { name: "Old Name" });
    const n1After = makeNode("n1", { name: "New Name" });
    const before = makeSnapshot({ nodes: [n1Before] });
    const after = makeSnapshot({ nodes: [n1After] });

    const diff = diffWorkflows(before, after);

    expect(diff.hasChanges).toBe(true);
    expect(diff.modifiedNodes).toHaveLength(1);
    expect(diff.modifiedNodes[0].before.name).toBe("Old Name");
    expect(diff.modifiedNodes[0].after.name).toBe("New Name");
  });

  it("should detect added connections", () => {
    const c1 = makeConnection("c1");
    const before = makeSnapshot({ connections: [] });
    const after = makeSnapshot({ connections: [c1] });

    const diff = diffWorkflows(before, after);

    expect(diff.hasChanges).toBe(true);
    expect(diff.addedConnections).toHaveLength(1);
    expect(diff.addedConnections[0].id).toBe("c1");
    expect(diff.removedConnections).toHaveLength(0);
  });

  it("should detect removed connections", () => {
    const c1 = makeConnection("c1");
    const before = makeSnapshot({ connections: [c1] });
    const after = makeSnapshot({ connections: [] });

    const diff = diffWorkflows(before, after);

    expect(diff.hasChanges).toBe(true);
    expect(diff.removedConnections).toHaveLength(1);
    expect(diff.removedConnections[0].id).toBe("c1");
    expect(diff.addedConnections).toHaveLength(0);
  });

  it("should accumulate total change count correctly", () => {
    const n1 = makeNode("n1");
    const n2 = makeNode("n2");
    const n3Before = makeNode("n3", { name: "Before" });
    const n3After = makeNode("n3", { name: "After" });
    const c1 = makeConnection("c1");
    const c2 = makeConnection("c2");

    const before = makeSnapshot({ nodes: [n1, n2, n3Before], connections: [c1] });
    const after = makeSnapshot({ nodes: [n1, n3After], connections: [c2] });

    const diff = diffWorkflows(before, after);

    // removed: n2 (1), modified: n3 (1), removed conn: c1 (1), added conn: c2 (1)
    expect(diff.changeCount).toBe(4);
    expect(diff.removedNodes).toHaveLength(1);
    expect(diff.modifiedNodes).toHaveLength(1);
  });
});

describe("getNodeChanges", () => {
  it("should return no changes for identical nodes", () => {
    const node = makeNode("n1", { name: "Test", type: "trigger", data: { key: "value" } });
    const changes = getNodeChanges(node, node);
    expect(changes).toHaveLength(0);
  });

  it("should detect name change", () => {
    const before = makeNode("n1", { name: "Before" });
    const after = makeNode("n1", { name: "After" });
    const changes = getNodeChanges(before, after);

    expect(changes).toHaveLength(1);
    expect(changes[0].field).toBe("name");
    expect(changes[0].before).toBe("Before");
    expect(changes[0].after).toBe("After");
  });

  it("should detect type change", () => {
    const before = makeNode("n1", { type: "action" });
    const after = makeNode("n1", { type: "trigger" });
    const changes = getNodeChanges(before, after);

    const typeChange = changes.find((c) => c.field === "type");
    expect(typeChange).toBeDefined();
    expect(typeChange!.before).toBe("action");
    expect(typeChange!.after).toBe("trigger");
  });

  it("should detect position x change", () => {
    const before = makeNode("n1", { position: { x: 10, y: 0 } });
    const after = makeNode("n1", { position: { x: 50, y: 0 } });
    const changes = getNodeChanges(before, after);

    const xChange = changes.find((c) => c.field === "position.x");
    expect(xChange).toBeDefined();
    expect(xChange!.before).toBe(10);
    expect(xChange!.after).toBe(50);
  });

  it("should detect position y change", () => {
    const before = makeNode("n1", { position: { x: 0, y: 20 } });
    const after = makeNode("n1", { position: { x: 0, y: 80 } });
    const changes = getNodeChanges(before, after);

    const yChange = changes.find((c) => c.field === "position.y");
    expect(yChange).toBeDefined();
    expect(yChange!.before).toBe(20);
    expect(yChange!.after).toBe(80);
  });

  it("should detect data field change", () => {
    const before = makeNode("n1", { data: { url: "http://old.com", timeout: 5000 } });
    const after = makeNode("n1", { data: { url: "http://new.com", timeout: 5000 } });
    const changes = getNodeChanges(before, after);

    const urlChange = changes.find((c) => c.field === "data.url");
    expect(urlChange).toBeDefined();
    expect(urlChange!.before).toBe("http://old.com");
    expect(urlChange!.after).toBe("http://new.com");
  });

  it("should detect added data field", () => {
    const before = makeNode("n1", { data: {} });
    const after = makeNode("n1", { data: { newField: "value" } });
    const changes = getNodeChanges(before, after);

    const newChange = changes.find((c) => c.field === "data.newField");
    expect(newChange).toBeDefined();
    expect(newChange!.before).toBeUndefined();
    expect(newChange!.after).toBe("value");
  });

  it("should detect removed data field", () => {
    const before = makeNode("n1", { data: { oldField: "value" } });
    const after = makeNode("n1", { data: {} });
    const changes = getNodeChanges(before, after);

    const removedChange = changes.find((c) => c.field === "data.oldField");
    expect(removedChange).toBeDefined();
    expect(removedChange!.before).toBe("value");
    expect(removedChange!.after).toBeUndefined();
  });

  it("should detect multiple changes at once", () => {
    const before = makeNode("n1", { name: "Old", type: "action", position: { x: 0, y: 0 } });
    const after = makeNode("n1", { name: "New", type: "trigger", position: { x: 100, y: 200 } });
    const changes = getNodeChanges(before, after);

    expect(changes.length).toBeGreaterThanOrEqual(4);
  });
});

describe("createSnapshot", () => {
  it("should create a valid snapshot with current date", () => {
    const before = Date.now();
    const snapshot = createSnapshot({
      id: "wf1",
      name: "My Workflow",
      nodes: [makeNode("n1")],
      connections: [makeConnection("c1")],
    });
    const after = Date.now();

    expect(snapshot.id).toBe("wf1");
    expect(snapshot.name).toBe("My Workflow");
    expect(snapshot.nodes).toHaveLength(1);
    expect(snapshot.connections).toHaveLength(1);
    expect(snapshot.createdAt).toBeInstanceOf(Date);
    expect(snapshot.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(snapshot.createdAt.getTime()).toBeLessThanOrEqual(after);
  });

  it("should preserve nodes and connections exactly", () => {
    const nodes = [makeNode("n1"), makeNode("n2")];
    const connections = [makeConnection("c1"), makeConnection("c2")];
    const snapshot = createSnapshot({ id: "wf2", name: "Flow", nodes, connections });

    expect(snapshot.nodes).toBe(nodes);
    expect(snapshot.connections).toBe(connections);
  });
});

describe("applySnapshot", () => {
  it("should return nodes and connections from snapshot", () => {
    const nodes = [makeNode("n1"), makeNode("n2")];
    const connections = [makeConnection("c1")];
    const snapshot = makeSnapshot({ nodes, connections });

    const result = applySnapshot(snapshot);

    expect(result.nodes).toEqual(nodes);
    expect(result.connections).toEqual(connections);
  });

  it("should return empty arrays for empty snapshot", () => {
    const snapshot = makeSnapshot({ nodes: [], connections: [] });
    const result = applySnapshot(snapshot);

    expect(result.nodes).toHaveLength(0);
    expect(result.connections).toHaveLength(0);
  });
});

describe("summarizeDiff", () => {
  it("should return 'No changes' when nothing changed", () => {
    const nodes = [makeNode("n1")];
    const snapshot = makeSnapshot({ nodes });
    const diff = diffWorkflows(snapshot, snapshot);

    expect(summarizeDiff(diff)).toBe("No changes");
  });

  it("should describe added nodes", () => {
    const before = makeSnapshot({ nodes: [] });
    const after = makeSnapshot({ nodes: [makeNode("n1"), makeNode("n2")] });
    const diff = diffWorkflows(before, after);

    const summary = summarizeDiff(diff);
    expect(summary).toContain("Added 2 nodes");
  });

  it("should describe removed nodes (singular)", () => {
    const before = makeSnapshot({ nodes: [makeNode("n1")] });
    const after = makeSnapshot({ nodes: [] });
    const diff = diffWorkflows(before, after);

    const summary = summarizeDiff(diff);
    expect(summary).toContain("removed 1 node");
    expect(summary).not.toContain("nodes");
  });

  it("should describe modified nodes", () => {
    const before = makeSnapshot({ nodes: [makeNode("n1", { name: "Old" })] });
    const after = makeSnapshot({ nodes: [makeNode("n1", { name: "New" })] });
    const diff = diffWorkflows(before, after);

    const summary = summarizeDiff(diff);
    expect(summary).toContain("modified 1 node");
  });

  it("should describe added connection (singular)", () => {
    const before = makeSnapshot({ connections: [] });
    const after = makeSnapshot({ connections: [makeConnection("c1")] });
    const diff = diffWorkflows(before, after);

    const summary = summarizeDiff(diff);
    expect(summary).toContain("added 1 connection");
    expect(summary).not.toContain("connections");
  });

  it("should describe all changes combined", () => {
    const n1 = makeNode("n1");
    const n2Before = makeNode("n2", { name: "Before" });
    const n2After = makeNode("n2", { name: "After" });
    const c1 = makeConnection("c1");
    const c2 = makeConnection("c2");

    const before = makeSnapshot({ nodes: [n1, n2Before], connections: [c1] });
    const after = makeSnapshot({ nodes: [n2After], connections: [c2] });
    const diff = diffWorkflows(before, after);

    const summary = summarizeDiff(diff);
    expect(summary).toContain("removed 1 node");
    expect(summary).toContain("modified 1 node");
    expect(summary).toContain("added 1 connection");
    expect(summary).toContain("removed 1 connection");
  });
});

// ─── Phase 49: Typed Diff Engine Tests ───────────────────────────────────────

import {
  diffNodes,
  diffEdges,
  diffSettings,
  diffSnapshots,
  isBreakingChange,
  summarizeDiffEntries,
  applyDiff,
  invertDiff,
  mergeDiffs,
  formatDiffEntry,
  formatDiff,
  filterDiff,
  isDiffEmpty,
  type WorkflowNode,
  type WorkflowEdge,
  type WorkflowVersionSnapshot,
  type DiffEntry,
  type WorkflowDiff,
} from "./workflow-diff";

function makeWNode(id: string, overrides: Partial<WorkflowNode> = {}): WorkflowNode {
  return {
    id,
    type: "http",
    label: `Node ${id}`,
    config: {},
    position: { x: 0, y: 0 },
    ...overrides,
  };
}

function makeWEdge(id: string, overrides: Partial<WorkflowEdge> = {}): WorkflowEdge {
  return {
    id,
    source: "n1",
    target: "n2",
    ...overrides,
  };
}

function makeVersionSnapshot(overrides: Partial<WorkflowVersionSnapshot> = {}): WorkflowVersionSnapshot {
  return {
    id: "snap-1",
    workflowId: "wf-1",
    version: 1,
    name: "My Workflow",
    nodes: [],
    edges: [],
    settings: {},
    createdAt: new Date("2024-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeDiff(overrides: Partial<WorkflowDiff> = {}): WorkflowDiff {
  return {
    fromVersion: 1,
    toVersion: 2,
    entries: [],
    summary: { added: 0, removed: 0, updated: 0, moved: 0 },
    hasBreakingChanges: false,
    breakingReasons: [],
    ...overrides,
  };
}

// ─── diffNodes ────────────────────────────────────────────────────────────────

describe("diffNodes (Phase 49)", () => {
  it("returns empty array for identical nodes", () => {
    const nodes = [makeWNode("n1"), makeWNode("n2")];
    expect(diffNodes(nodes, nodes)).toHaveLength(0);
  });

  it("detects added node", () => {
    const entries = diffNodes([makeWNode("n1")], [makeWNode("n1"), makeWNode("n2")]);
    const added = entries.filter((e) => e.operation === "add");
    expect(added).toHaveLength(1);
    expect(added[0].targetId).toBe("n2");
  });

  it("detects removed node", () => {
    const entries = diffNodes([makeWNode("n1"), makeWNode("n2")], [makeWNode("n1")]);
    const removed = entries.filter((e) => e.operation === "remove");
    expect(removed).toHaveLength(1);
    expect(removed[0].targetId).toBe("n2");
  });

  it("detects position move", () => {
    const old = [makeWNode("n1", { position: { x: 0, y: 0 } })];
    const next = [makeWNode("n1", { position: { x: 100, y: 200 } })];
    const entries = diffNodes(old, next);
    const moved = entries.filter((e) => e.operation === "move");
    expect(moved).toHaveLength(1);
    expect(moved[0].path).toBe("position");
  });

  it("detects type change", () => {
    const old = [makeWNode("n1", { type: "http" })];
    const next = [makeWNode("n1", { type: "code" })];
    const entries = diffNodes(old, next);
    const updated = entries.filter((e) => e.operation === "update" && e.path === "type");
    expect(updated).toHaveLength(1);
  });

  it("detects label change", () => {
    const old = [makeWNode("n1", { label: "Old" })];
    const next = [makeWNode("n1", { label: "New" })];
    const entries = diffNodes(old, next);
    const updated = entries.filter((e) => e.path === "label");
    expect(updated).toHaveLength(1);
    expect(updated[0].oldValue).toBe("Old");
    expect(updated[0].newValue).toBe("New");
  });

  it("detects config change", () => {
    const old = [makeWNode("n1", { config: { url: "http://old.com" } })];
    const next = [makeWNode("n1", { config: { url: "http://new.com" } })];
    const entries = diffNodes(old, next);
    const updated = entries.filter((e) => e.operation === "update");
    expect(updated.length).toBeGreaterThan(0);
  });
});

// ─── diffEdges ────────────────────────────────────────────────────────────────

describe("diffEdges (Phase 49)", () => {
  it("returns empty for identical edges", () => {
    const edges = [makeWEdge("e1")];
    expect(diffEdges(edges, edges)).toHaveLength(0);
  });

  it("detects added edge", () => {
    const entries = diffEdges([], [makeWEdge("e1")]);
    expect(entries).toHaveLength(1);
    expect(entries[0].operation).toBe("add");
  });

  it("detects removed edge", () => {
    const entries = diffEdges([makeWEdge("e1")], []);
    expect(entries).toHaveLength(1);
    expect(entries[0].operation).toBe("remove");
  });

  it("detects connection change", () => {
    const old = [makeWEdge("e1", { source: "n1", target: "n2" })];
    const next = [makeWEdge("e1", { source: "n1", target: "n3" })];
    const entries = diffEdges(old, next);
    const updated = entries.filter((e) => e.path === "connection");
    expect(updated).toHaveLength(1);
  });

  it("detects label change", () => {
    const old = [makeWEdge("e1", { label: "Old" })];
    const next = [makeWEdge("e1", { label: "New" })];
    const entries = diffEdges(old, next);
    const updated = entries.filter((e) => e.path === "label");
    expect(updated).toHaveLength(1);
  });
});

// ─── diffSettings ─────────────────────────────────────────────────────────────

describe("diffSettings (Phase 49)", () => {
  it("returns empty for identical settings", () => {
    const settings = { timeout: 30, retries: 3 };
    expect(diffSettings(settings, settings)).toHaveLength(0);
  });

  it("detects added setting", () => {
    const entries = diffSettings({}, { newKey: "value" });
    expect(entries).toHaveLength(1);
    expect(entries[0].operation).toBe("add");
  });

  it("detects removed setting", () => {
    const entries = diffSettings({ oldKey: "value" }, {});
    expect(entries).toHaveLength(1);
    expect(entries[0].operation).toBe("remove");
  });

  it("detects updated setting", () => {
    const entries = diffSettings({ key: "old" }, { key: "new" });
    expect(entries).toHaveLength(1);
    expect(entries[0].operation).toBe("update");
    expect(entries[0].oldValue).toBe("old");
    expect(entries[0].newValue).toBe("new");
  });

  it("handles nested settings", () => {
    const entries = diffSettings(
      { db: { host: "localhost" } },
      { db: { host: "prod.db.com" } },
    );
    expect(entries.length).toBeGreaterThan(0);
  });
});

// ─── diffSnapshots ────────────────────────────────────────────────────────────

describe("diffSnapshots (Phase 49)", () => {
  it("returns empty diff for identical snapshots", () => {
    const snap = makeVersionSnapshot({
      nodes: [makeWNode("n1")],
      edges: [makeWEdge("e1")],
      settings: { timeout: 30 },
    });
    const diff = diffSnapshots(snap, snap);
    expect(diff.entries).toHaveLength(0);
    expect(diff.hasBreakingChanges).toBe(false);
  });

  it("detects version numbers correctly", () => {
    const from = makeVersionSnapshot({ version: 1 });
    const to = makeVersionSnapshot({ version: 3 });
    const diff = diffSnapshots(from, to);
    expect(diff.fromVersion).toBe(1);
    expect(diff.toVersion).toBe(3);
  });

  it("marks breaking when node is removed", () => {
    const from = makeVersionSnapshot({ nodes: [makeWNode("n1")], version: 1 });
    const to = makeVersionSnapshot({ nodes: [], version: 2 });
    const diff = diffSnapshots(from, to);
    expect(diff.hasBreakingChanges).toBe(true);
    expect(diff.breakingReasons.length).toBeGreaterThan(0);
  });

  it("marks breaking when edge is removed", () => {
    const from = makeVersionSnapshot({ edges: [makeWEdge("e1")], version: 1 });
    const to = makeVersionSnapshot({ edges: [], version: 2 });
    const diff = diffSnapshots(from, to);
    expect(diff.hasBreakingChanges).toBe(true);
  });
});

// ─── isBreakingChange ─────────────────────────────────────────────────────────

describe("isBreakingChange (Phase 49)", () => {
  it("returns true for removed node", () => {
    const entry: DiffEntry = {
      operation: "remove",
      target: "node",
      targetId: "n1",
      description: "removed",
    };
    expect(isBreakingChange(entry)).toBe(true);
  });

  it("returns true for removed edge", () => {
    const entry: DiffEntry = {
      operation: "remove",
      target: "edge",
      targetId: "e1",
      description: "removed",
    };
    expect(isBreakingChange(entry)).toBe(true);
  });

  it("returns true for node type change", () => {
    const entry: DiffEntry = {
      operation: "update",
      target: "node",
      targetId: "n1",
      path: "type",
      description: "type changed",
    };
    expect(isBreakingChange(entry)).toBe(true);
  });

  it("returns false for added node", () => {
    const entry: DiffEntry = {
      operation: "add",
      target: "node",
      targetId: "n1",
      description: "added",
    };
    expect(isBreakingChange(entry)).toBe(false);
  });

  it("returns false for setting change", () => {
    const entry: DiffEntry = {
      operation: "update",
      target: "setting",
      targetId: "timeout",
      description: "setting updated",
    };
    expect(isBreakingChange(entry)).toBe(false);
  });
});

// ─── summarizeDiffEntries ─────────────────────────────────────────────────────

describe("summarizeDiffEntries (Phase 49)", () => {
  it("returns zero counts for empty entries", () => {
    const summary = summarizeDiffEntries([]);
    expect(summary).toEqual({ added: 0, removed: 0, updated: 0, moved: 0 });
  });

  it("counts each operation type correctly", () => {
    const entries: DiffEntry[] = [
      { operation: "add", target: "node", targetId: "n1", description: "a" },
      { operation: "add", target: "node", targetId: "n2", description: "b" },
      { operation: "remove", target: "edge", targetId: "e1", description: "c" },
      { operation: "update", target: "setting", targetId: "s1", description: "d" },
      { operation: "move", target: "node", targetId: "n3", description: "e" },
    ];
    const summary = summarizeDiffEntries(entries);
    expect(summary.added).toBe(2);
    expect(summary.removed).toBe(1);
    expect(summary.updated).toBe(1);
    expect(summary.moved).toBe(1);
  });
});

// ─── applyDiff ────────────────────────────────────────────────────────────────

describe("applyDiff (Phase 49)", () => {
  it("adds a node", () => {
    const snap = makeVersionSnapshot({ nodes: [] });
    const newNode = makeWNode("n1");
    const diff = makeDiff({
      entries: [{ operation: "add", target: "node", targetId: "n1", newValue: newNode, description: "add" }],
    });
    const result = applyDiff(snap, diff);
    expect(result.nodes).toHaveLength(1);
  });

  it("removes a node", () => {
    const snap = makeVersionSnapshot({ nodes: [makeWNode("n1")] });
    const diff = makeDiff({
      entries: [{ operation: "remove", target: "node", targetId: "n1", description: "remove" }],
    });
    const result = applyDiff(snap, diff);
    expect(result.nodes).toHaveLength(0);
  });

  it("adds an edge", () => {
    const snap = makeVersionSnapshot({ edges: [] });
    const newEdge = makeWEdge("e1");
    const diff = makeDiff({
      entries: [{ operation: "add", target: "edge", targetId: "e1", newValue: newEdge, description: "add" }],
    });
    const result = applyDiff(snap, diff);
    expect(result.edges).toHaveLength(1);
  });

  it("removes an edge", () => {
    const snap = makeVersionSnapshot({ edges: [makeWEdge("e1")] });
    const diff = makeDiff({
      entries: [{ operation: "remove", target: "edge", targetId: "e1", description: "remove" }],
    });
    const result = applyDiff(snap, diff);
    expect(result.edges).toHaveLength(0);
  });

  it("updates version number", () => {
    const snap = makeVersionSnapshot({ version: 1 });
    const diff = makeDiff({ fromVersion: 1, toVersion: 5 });
    const result = applyDiff(snap, diff);
    expect(result.version).toBe(5);
  });

  it("adds a setting", () => {
    const snap = makeVersionSnapshot({ settings: {} });
    const diff = makeDiff({
      entries: [{ operation: "add", target: "setting", targetId: "timeout", path: "timeout", newValue: 30, description: "add" }],
    });
    const result = applyDiff(snap, diff);
    expect(result.settings["timeout"]).toBe(30);
  });
});

// ─── invertDiff ───────────────────────────────────────────────────────────────

describe("invertDiff (Phase 49)", () => {
  it("swaps add → remove", () => {
    const diff = makeDiff({
      entries: [{ operation: "add", target: "node", targetId: "n1", description: "add" }],
    });
    const inverted = invertDiff(diff);
    expect(inverted.entries[0].operation).toBe("remove");
  });

  it("swaps remove → add", () => {
    const diff = makeDiff({
      entries: [{ operation: "remove", target: "node", targetId: "n1", description: "remove" }],
    });
    const inverted = invertDiff(diff);
    expect(inverted.entries[0].operation).toBe("add");
  });

  it("swaps version numbers", () => {
    const diff = makeDiff({ fromVersion: 1, toVersion: 3 });
    const inverted = invertDiff(diff);
    expect(inverted.fromVersion).toBe(3);
    expect(inverted.toVersion).toBe(1);
  });

  it("swaps oldValue and newValue", () => {
    const diff = makeDiff({
      entries: [{
        operation: "update",
        target: "setting",
        targetId: "x",
        oldValue: "old",
        newValue: "new",
        description: "update",
      }],
    });
    const inverted = invertDiff(diff);
    expect(inverted.entries[0].oldValue).toBe("new");
    expect(inverted.entries[0].newValue).toBe("old");
  });
});

// ─── mergeDiffs ───────────────────────────────────────────────────────────────

describe("mergeDiffs (Phase 49)", () => {
  it("combines entries from both diffs", () => {
    const a = makeDiff({
      fromVersion: 1,
      toVersion: 2,
      entries: [{ operation: "add", target: "node", targetId: "n1", description: "a" }],
    });
    const b = makeDiff({
      fromVersion: 2,
      toVersion: 3,
      entries: [{ operation: "remove", target: "edge", targetId: "e1", description: "b" }],
    });
    const merged = mergeDiffs(a, b);
    expect(merged.entries).toHaveLength(2);
  });

  it("uses fromVersion of a and toVersion of b", () => {
    const a = makeDiff({ fromVersion: 1, toVersion: 2 });
    const b = makeDiff({ fromVersion: 2, toVersion: 5 });
    const merged = mergeDiffs(a, b);
    expect(merged.fromVersion).toBe(1);
    expect(merged.toVersion).toBe(5);
  });

  it("marks breaking if any entry is breaking", () => {
    const a = makeDiff({ fromVersion: 1, toVersion: 2 });
    const b = makeDiff({
      fromVersion: 2,
      toVersion: 3,
      entries: [{ operation: "remove", target: "node", targetId: "n1", description: "remove" }],
    });
    const merged = mergeDiffs(a, b);
    expect(merged.hasBreakingChanges).toBe(true);
  });
});

// ─── formatDiffEntry ─────────────────────────────────────────────────────────

describe("formatDiffEntry (Phase 49)", () => {
  it("formats an add entry", () => {
    const entry: DiffEntry = {
      operation: "add",
      target: "node",
      targetId: "n1",
      description: "Added node",
    };
    const formatted = formatDiffEntry(entry);
    expect(formatted).toContain("[+]");
    expect(formatted).toContain("node:n1");
  });

  it("formats a remove entry", () => {
    const entry: DiffEntry = {
      operation: "remove",
      target: "edge",
      targetId: "e1",
      description: "Removed edge",
    };
    const formatted = formatDiffEntry(entry);
    expect(formatted).toContain("[-]");
  });

  it("includes path when present", () => {
    const entry: DiffEntry = {
      operation: "update",
      target: "node",
      targetId: "n1",
      path: "config.url",
      description: "Updated",
    };
    const formatted = formatDiffEntry(entry);
    expect(formatted).toContain("[config.url]");
  });
});

// ─── formatDiff ───────────────────────────────────────────────────────────────

describe("formatDiff (Phase 49)", () => {
  it("includes version info", () => {
    const diff = makeDiff({ fromVersion: 1, toVersion: 2 });
    const output = formatDiff(diff);
    expect(output).toContain("v1");
    expect(output).toContain("v2");
  });

  it("shows no changes for empty diff", () => {
    const diff = makeDiff();
    const output = formatDiff(diff);
    expect(output).toContain("no changes");
  });

  it("lists entries", () => {
    const diff = makeDiff({
      entries: [{ operation: "add", target: "node", targetId: "n1", description: "Added node" }],
    });
    const output = formatDiff(diff);
    expect(output).toContain("node:n1");
  });
});

// ─── filterDiff ───────────────────────────────────────────────────────────────

describe("filterDiff (Phase 49)", () => {
  it("filters to only node entries", () => {
    const diff = makeDiff({
      entries: [
        { operation: "add", target: "node", targetId: "n1", description: "a" },
        { operation: "add", target: "edge", targetId: "e1", description: "b" },
        { operation: "update", target: "setting", targetId: "s1", description: "c" },
      ],
    });
    const filtered = filterDiff(diff, ["node"]);
    expect(filtered.entries).toHaveLength(1);
    expect(filtered.entries[0].target).toBe("node");
  });

  it("filters to multiple targets", () => {
    const diff = makeDiff({
      entries: [
        { operation: "add", target: "node", targetId: "n1", description: "a" },
        { operation: "add", target: "edge", targetId: "e1", description: "b" },
        { operation: "update", target: "setting", targetId: "s1", description: "c" },
      ],
    });
    const filtered = filterDiff(diff, ["node", "edge"]);
    expect(filtered.entries).toHaveLength(2);
  });

  it("returns empty when no matching targets", () => {
    const diff = makeDiff({
      entries: [
        { operation: "add", target: "node", targetId: "n1", description: "a" },
      ],
    });
    const filtered = filterDiff(diff, ["setting"]);
    expect(filtered.entries).toHaveLength(0);
  });
});

// ─── isDiffEmpty ─────────────────────────────────────────────────────────────

describe("isDiffEmpty (Phase 49)", () => {
  it("returns true for empty diff", () => {
    expect(isDiffEmpty(makeDiff())).toBe(true);
  });

  it("returns false for non-empty diff", () => {
    const diff = makeDiff({
      entries: [{ operation: "add", target: "node", targetId: "n1", description: "a" }],
    });
    expect(isDiffEmpty(diff)).toBe(false);
  });
});
