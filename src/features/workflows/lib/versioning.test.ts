import { describe, it, expect, beforeEach } from "vitest";
import {
  createSnapshot,
  nextVersion,
  getLatestSnapshot,
  getSnapshotByVersion,
  diffSnapshots,
  hasChanges,
  describeDiff,
  trimSnapshots,
  type WorkflowSnapshot,
  type SnapshotNode,
  type SnapshotConnection,
} from "./versioning";

const makeNode = (id: string, overrides: Partial<SnapshotNode> = {}): SnapshotNode => ({
  id,
  name: `Node ${id}`,
  type: "HTTP_REQUEST",
  position: { x: 0, y: 0 },
  data: { url: "https://example.com" },
  ...overrides,
});

const makeConn = (id: string, from = "n1", to = "n2"): SnapshotConnection => ({
  id,
  fromNodeId: from,
  toNodeId: to,
  fromOutput: "main",
  toInput: "main",
});

const makeSnapshot = (version: number, overrides: Partial<WorkflowSnapshot> = {}): WorkflowSnapshot => ({
  version,
  workflowId: "wf-1",
  name: "My Workflow",
  nodes: [makeNode("n1"), makeNode("n2")],
  connections: [makeConn("c1")],
  createdAt: new Date(),
  createdBy: "user-1",
  ...overrides,
});

describe("createSnapshot", () => {
  it("creates a snapshot with createdAt", () => {
    const snap = createSnapshot({
      version: 1,
      workflowId: "wf-1",
      name: "WF",
      nodes: [],
      connections: [],
      createdBy: "user-1",
      message: "initial",
    });
    expect(snap.version).toBe(1);
    expect(snap.message).toBe("initial");
    expect(snap.createdAt).toBeInstanceOf(Date);
  });
});

describe("nextVersion", () => {
  it("returns 1 for empty snapshots", () => {
    expect(nextVersion([])).toBe(1);
  });

  it("returns max version + 1", () => {
    const snaps = [makeSnapshot(1), makeSnapshot(3), makeSnapshot(2)];
    expect(nextVersion(snaps)).toBe(4);
  });
});

describe("getLatestSnapshot", () => {
  it("returns null for empty array", () => {
    expect(getLatestSnapshot([])).toBeNull();
  });

  it("returns the highest version snapshot", () => {
    const snaps = [makeSnapshot(2), makeSnapshot(5), makeSnapshot(1)];
    expect(getLatestSnapshot(snaps)?.version).toBe(5);
  });
});

describe("getSnapshotByVersion", () => {
  it("finds a specific version", () => {
    const snaps = [makeSnapshot(1), makeSnapshot(2)];
    expect(getSnapshotByVersion(snaps, 2)?.version).toBe(2);
  });

  it("returns null if version not found", () => {
    expect(getSnapshotByVersion([makeSnapshot(1)], 99)).toBeNull();
  });
});

describe("diffSnapshots", () => {
  it("detects added nodes", () => {
    const from = makeSnapshot(1, { nodes: [makeNode("n1")] });
    const to = makeSnapshot(2, { nodes: [makeNode("n1"), makeNode("n2")] });
    const diff = diffSnapshots(from, to);
    expect(diff.addedNodes).toContain("n2");
    expect(diff.removedNodes).toHaveLength(0);
  });

  it("detects removed nodes", () => {
    const from = makeSnapshot(1, { nodes: [makeNode("n1"), makeNode("n2")] });
    const to = makeSnapshot(2, { nodes: [makeNode("n1")] });
    const diff = diffSnapshots(from, to);
    expect(diff.removedNodes).toContain("n2");
  });

  it("detects modified nodes (data change)", () => {
    const from = makeSnapshot(1, { nodes: [makeNode("n1", { data: { url: "a" } })] });
    const to = makeSnapshot(2, { nodes: [makeNode("n1", { data: { url: "b" } })] });
    const diff = diffSnapshots(from, to);
    expect(diff.modifiedNodes).toContain("n1");
  });

  it("detects position change as modification", () => {
    const from = makeSnapshot(1, { nodes: [makeNode("n1", { position: { x: 0, y: 0 } })] });
    const to = makeSnapshot(2, { nodes: [makeNode("n1", { position: { x: 100, y: 200 } })] });
    const diff = diffSnapshots(from, to);
    expect(diff.modifiedNodes).toContain("n1");
  });

  it("detects name change", () => {
    const from = makeSnapshot(1, { name: "Old Name" });
    const to = makeSnapshot(2, { name: "New Name" });
    const diff = diffSnapshots(from, to);
    expect(diff.nameChanged).toBe(true);
  });

  it("detects added connections", () => {
    const from = makeSnapshot(1, { connections: [] });
    const to = makeSnapshot(2, { connections: [makeConn("c1")] });
    const diff = diffSnapshots(from, to);
    expect(diff.addedConnections).toContain("c1");
  });

  it("detects no changes when identical", () => {
    const snap = makeSnapshot(1);
    const diff = diffSnapshots(snap, makeSnapshot(2, { nodes: snap.nodes, connections: snap.connections }));
    expect(hasChanges(diff)).toBe(false);
  });
});

describe("hasChanges", () => {
  it("returns false when nothing changed", () => {
    const diff = {
      addedNodes: [],
      removedNodes: [],
      modifiedNodes: [],
      addedConnections: [],
      removedConnections: [],
      nameChanged: false,
    };
    expect(hasChanges(diff)).toBe(false);
  });

  it("returns true when something changed", () => {
    const diff = {
      addedNodes: ["n3"],
      removedNodes: [],
      modifiedNodes: [],
      addedConnections: [],
      removedConnections: [],
      nameChanged: false,
    };
    expect(hasChanges(diff)).toBe(true);
  });
});

describe("describeDiff", () => {
  it("returns 'No changes' for empty diff", () => {
    const diff = { addedNodes: [], removedNodes: [], modifiedNodes: [], addedConnections: [], removedConnections: [], nameChanged: false };
    expect(describeDiff(diff)).toBe("No changes");
  });

  it("describes multiple changes", () => {
    const diff = { addedNodes: ["n1", "n2"], removedNodes: [], modifiedNodes: ["n3"], addedConnections: [], removedConnections: [], nameChanged: true };
    const desc = describeDiff(diff);
    expect(desc).toContain("renamed workflow");
    expect(desc).toContain("added 2 node(s)");
    expect(desc).toContain("modified 1 node(s)");
  });
});

describe("trimSnapshots", () => {
  it("keeps all snapshots if under limit", () => {
    const snaps = [makeSnapshot(1), makeSnapshot(2)];
    expect(trimSnapshots(snaps, 10)).toHaveLength(2);
  });

  it("trims to keep only latest N", () => {
    const snaps = [makeSnapshot(1), makeSnapshot(2), makeSnapshot(3), makeSnapshot(4), makeSnapshot(5)];
    const trimmed = trimSnapshots(snaps, 3);
    expect(trimmed).toHaveLength(3);
    const versions = trimmed.map((s) => s.version).sort((a, b) => b - a);
    expect(versions[0]).toBe(5);
    expect(versions[1]).toBe(4);
    expect(versions[2]).toBe(3);
  });
});
