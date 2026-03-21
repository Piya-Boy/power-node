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
