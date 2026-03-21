/**
 * Workflow diffing utilities for comparing workflow snapshots.
 * Phase 49 additions: WorkflowDiff engine with typed DiffEntry, diffNodes, diffEdges,
 * diffSettings, diffSnapshots, invertDiff, mergeDiffs, applyDiff, formatDiff, filterDiff.
 */

export interface SnapshotNode {
  id: string;
  name: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface SnapshotConnection {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  fromOutput: string;
  toInput: string;
}

export interface WorkflowSnapshot {
  id: string;
  name: string;
  nodes: SnapshotNode[];
  connections: SnapshotConnection[];
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export interface DiffResult {
  addedNodes: SnapshotNode[];
  removedNodes: SnapshotNode[];
  modifiedNodes: Array<{ before: SnapshotNode; after: SnapshotNode }>;
  addedConnections: SnapshotConnection[];
  removedConnections: SnapshotConnection[];
  hasChanges: boolean;
  changeCount: number;
}

export interface NodeChange {
  field: string;
  before: unknown;
  after: unknown;
}

/**
 * Compare two workflow snapshots and return a diff result.
 */
export function diffWorkflows(
  before: WorkflowSnapshot,
  after: WorkflowSnapshot,
): DiffResult {
  const beforeNodeMap = new Map(before.nodes.map((n) => [n.id, n]));
  const afterNodeMap = new Map(after.nodes.map((n) => [n.id, n]));

  const addedNodes: SnapshotNode[] = [];
  const removedNodes: SnapshotNode[] = [];
  const modifiedNodes: Array<{ before: SnapshotNode; after: SnapshotNode }> = [];

  // Find removed and modified nodes
  for (const [id, beforeNode] of beforeNodeMap) {
    const afterNode = afterNodeMap.get(id);
    if (!afterNode) {
      removedNodes.push(beforeNode);
    } else {
      const changes = getNodeChanges(beforeNode, afterNode);
      if (changes.length > 0) {
        modifiedNodes.push({ before: beforeNode, after: afterNode });
      }
    }
  }

  // Find added nodes
  for (const [id, afterNode] of afterNodeMap) {
    if (!beforeNodeMap.has(id)) {
      addedNodes.push(afterNode);
    }
  }

  const beforeConnMap = new Map(before.connections.map((c) => [c.id, c]));
  const afterConnMap = new Map(after.connections.map((c) => [c.id, c]));

  const addedConnections: SnapshotConnection[] = [];
  const removedConnections: SnapshotConnection[] = [];

  for (const [id, conn] of beforeConnMap) {
    if (!afterConnMap.has(id)) {
      removedConnections.push(conn);
    }
  }

  for (const [id, conn] of afterConnMap) {
    if (!beforeConnMap.has(id)) {
      addedConnections.push(conn);
    }
  }

  const changeCount =
    addedNodes.length +
    removedNodes.length +
    modifiedNodes.length +
    addedConnections.length +
    removedConnections.length;

  return {
    addedNodes,
    removedNodes,
    modifiedNodes,
    addedConnections,
    removedConnections,
    hasChanges: changeCount > 0,
    changeCount,
  };
}

/**
 * Get field-level changes between two node snapshots.
 */
export function getNodeChanges(
  before: SnapshotNode,
  after: SnapshotNode,
): NodeChange[] {
  const changes: NodeChange[] = [];

  if (before.name !== after.name) {
    changes.push({ field: "name", before: before.name, after: after.name });
  }

  if (before.type !== after.type) {
    changes.push({ field: "type", before: before.type, after: after.type });
  }

  if (before.position.x !== after.position.x) {
    changes.push({
      field: "position.x",
      before: before.position.x,
      after: after.position.x,
    });
  }

  if (before.position.y !== after.position.y) {
    changes.push({
      field: "position.y",
      before: before.position.y,
      after: after.position.y,
    });
  }

  // Compare data fields
  const allDataKeys = new Set([
    ...Object.keys(before.data),
    ...Object.keys(after.data),
  ]);

  for (const key of allDataKeys) {
    const beforeVal = before.data[key];
    const afterVal = after.data[key];
    if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
      changes.push({
        field: `data.${key}`,
        before: beforeVal,
        after: afterVal,
      });
    }
  }

  return changes;
}

/**
 * Create a workflow snapshot with the current timestamp.
 */
export function createSnapshot(workflow: {
  id: string;
  name: string;
  nodes: SnapshotNode[];
  connections: SnapshotConnection[];
}): WorkflowSnapshot {
  return {
    id: workflow.id,
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    createdAt: new Date(),
  };
}

/**
 * Extract nodes and connections from a snapshot.
 */
export function applySnapshot(snapshot: WorkflowSnapshot): {
  nodes: SnapshotNode[];
  connections: SnapshotConnection[];
} {
  return {
    nodes: snapshot.nodes,
    connections: snapshot.connections,
  };
}

/**
 * Generate a human-readable summary of a diff result.
 */
export function summarizeDiff(diff: DiffResult): string {
  if (!diff.hasChanges) {
    return "No changes";
  }

  const parts: string[] = [];

  if (diff.addedNodes.length > 0) {
    parts.push(
      `Added ${diff.addedNodes.length} node${diff.addedNodes.length === 1 ? "" : "s"}`,
    );
  }

  if (diff.removedNodes.length > 0) {
    parts.push(
      `removed ${diff.removedNodes.length} node${diff.removedNodes.length === 1 ? "" : "s"}`,
    );
  }

  if (diff.modifiedNodes.length > 0) {
    parts.push(
      `modified ${diff.modifiedNodes.length} node${diff.modifiedNodes.length === 1 ? "" : "s"}`,
    );
  }

  if (diff.addedConnections.length > 0) {
    parts.push(
      `added ${diff.addedConnections.length} connection${diff.addedConnections.length === 1 ? "" : "s"}`,
    );
  }

  if (diff.removedConnections.length > 0) {
    parts.push(
      `removed ${diff.removedConnections.length} connection${diff.removedConnections.length === 1 ? "" : "s"}`,
    );
  }

  return parts.join(", ");
}

// ─── Phase 49: Typed Diff Engine ─────────────────────────────────────────────

export type DiffOperation = "add" | "remove" | "update" | "move";
export type DiffTarget = "node" | "edge" | "setting" | "trigger";

export interface WorkflowNode {
  id: string;
  type: string;
  label: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface WorkflowVersionSnapshot {
  id: string;
  workflowId: string;
  version: number;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  settings: Record<string, unknown>;
  createdAt: Date;
}

export interface DiffEntry {
  operation: DiffOperation;
  target: DiffTarget;
  targetId: string;
  path?: string;
  oldValue?: unknown;
  newValue?: unknown;
  description: string;
}

export interface WorkflowDiff {
  fromVersion: number;
  toVersion: number;
  entries: DiffEntry[];
  summary: { added: number; removed: number; updated: number; moved: number };
  hasBreakingChanges: boolean;
  breakingReasons: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deepEqualV2(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if ((a as unknown[]).length !== (b as unknown[]).length) return false;
    return (a as unknown[]).every((v, i) => deepEqualV2(v, (b as unknown[])[i]));
  }
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj).sort();
  const bKeys = Object.keys(bObj).sort();
  if (aKeys.join(",") !== bKeys.join(",")) return false;
  return aKeys.every((k) => deepEqualV2(aObj[k], bObj[k]));
}

function flattenObjectV2(
  obj: Record<string, unknown>,
  prefix = "",
): Array<{ path: string; value: unknown }> {
  const result: Array<{ path: string; value: unknown }> = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result.push(...flattenObjectV2(value as Record<string, unknown>, path));
    } else {
      result.push({ path, value });
    }
  }
  return result;
}

// ─── diffNodes ────────────────────────────────────────────────────────────────

export function diffNodes(
  oldNodes: WorkflowNode[],
  newNodes: WorkflowNode[],
): DiffEntry[] {
  const entries: DiffEntry[] = [];
  const oldMap = new Map(oldNodes.map((n) => [n.id, n]));
  const newMap = new Map(newNodes.map((n) => [n.id, n]));

  for (const [id, node] of oldMap) {
    if (!newMap.has(id)) {
      entries.push({
        operation: "remove",
        target: "node",
        targetId: id,
        oldValue: node,
        description: `Removed node "${node.label}" (${node.type})`,
      });
    }
  }

  for (const [id, node] of newMap) {
    if (!oldMap.has(id)) {
      entries.push({
        operation: "add",
        target: "node",
        targetId: id,
        newValue: node,
        description: `Added node "${node.label}" (${node.type})`,
      });
    }
  }

  for (const [id, newNode] of newMap) {
    const oldNode = oldMap.get(id);
    if (!oldNode) continue;

    if (
      oldNode.position.x !== newNode.position.x ||
      oldNode.position.y !== newNode.position.y
    ) {
      entries.push({
        operation: "move",
        target: "node",
        targetId: id,
        path: "position",
        oldValue: oldNode.position,
        newValue: newNode.position,
        description: `Moved node "${newNode.label}" from (${oldNode.position.x},${oldNode.position.y}) to (${newNode.position.x},${newNode.position.y})`,
      });
    }

    if (oldNode.type !== newNode.type) {
      entries.push({
        operation: "update",
        target: "node",
        targetId: id,
        path: "type",
        oldValue: oldNode.type,
        newValue: newNode.type,
        description: `Updated node "${newNode.label}" type from "${oldNode.type}" to "${newNode.type}"`,
      });
    }

    if (oldNode.label !== newNode.label) {
      entries.push({
        operation: "update",
        target: "node",
        targetId: id,
        path: "label",
        oldValue: oldNode.label,
        newValue: newNode.label,
        description: `Renamed node from "${oldNode.label}" to "${newNode.label}"`,
      });
    }

    if (!deepEqualV2(oldNode.config, newNode.config)) {
      const oldFlat = flattenObjectV2(oldNode.config, "config");
      const newFlat = flattenObjectV2(newNode.config, "config");
      const oldFlatMap = new Map(oldFlat.map((e) => [e.path, e.value]));
      const newFlatMap = new Map(newFlat.map((e) => [e.path, e.value]));

      for (const { path, value } of oldFlat) {
        const newVal = newFlatMap.get(path);
        if (newVal === undefined) {
          entries.push({
            operation: "update",
            target: "node",
            targetId: id,
            path,
            oldValue: value,
            newValue: undefined,
            description: `Removed config field "${path}" from node "${newNode.label}"`,
          });
        } else if (!deepEqualV2(value, newVal)) {
          entries.push({
            operation: "update",
            target: "node",
            targetId: id,
            path,
            oldValue: value,
            newValue: newVal,
            description: `Updated config field "${path}" of node "${newNode.label}"`,
          });
        }
      }

      for (const { path, value } of newFlat) {
        if (!oldFlatMap.has(path)) {
          entries.push({
            operation: "update",
            target: "node",
            targetId: id,
            path,
            oldValue: undefined,
            newValue: value,
            description: `Added config field "${path}" to node "${newNode.label}"`,
          });
        }
      }
    }
  }

  return entries;
}

// ─── diffEdges ────────────────────────────────────────────────────────────────

export function diffEdges(
  oldEdges: WorkflowEdge[],
  newEdges: WorkflowEdge[],
): DiffEntry[] {
  const entries: DiffEntry[] = [];
  const oldMap = new Map(oldEdges.map((e) => [e.id, e]));
  const newMap = new Map(newEdges.map((e) => [e.id, e]));

  for (const [id, edge] of oldMap) {
    if (!newMap.has(id)) {
      entries.push({
        operation: "remove",
        target: "edge",
        targetId: id,
        oldValue: edge,
        description: `Removed edge from "${edge.source}" to "${edge.target}"`,
      });
    }
  }

  for (const [id, edge] of newMap) {
    if (!oldMap.has(id)) {
      entries.push({
        operation: "add",
        target: "edge",
        targetId: id,
        newValue: edge,
        description: `Added edge from "${edge.source}" to "${edge.target}"`,
      });
    }
  }

  for (const [id, newEdge] of newMap) {
    const oldEdge = oldMap.get(id);
    if (!oldEdge) continue;
    if (oldEdge.source !== newEdge.source || oldEdge.target !== newEdge.target) {
      entries.push({
        operation: "update",
        target: "edge",
        targetId: id,
        path: "connection",
        oldValue: { source: oldEdge.source, target: oldEdge.target },
        newValue: { source: newEdge.source, target: newEdge.target },
        description: `Updated edge connection from "${oldEdge.source}->${oldEdge.target}" to "${newEdge.source}->${newEdge.target}"`,
      });
    }
    if (oldEdge.label !== newEdge.label) {
      entries.push({
        operation: "update",
        target: "edge",
        targetId: id,
        path: "label",
        oldValue: oldEdge.label,
        newValue: newEdge.label,
        description: `Updated edge label`,
      });
    }
  }

  return entries;
}

// ─── diffSettings ─────────────────────────────────────────────────────────────

export function diffSettings(
  oldSettings: Record<string, unknown>,
  newSettings: Record<string, unknown>,
): DiffEntry[] {
  const entries: DiffEntry[] = [];
  const oldFlat = flattenObjectV2(oldSettings);
  const newFlat = flattenObjectV2(newSettings);
  const oldFlatMap = new Map(oldFlat.map((e) => [e.path, e.value]));
  const newFlatMap = new Map(newFlat.map((e) => [e.path, e.value]));

  for (const { path, value } of oldFlat) {
    const newVal = newFlatMap.get(path);
    if (newVal === undefined) {
      entries.push({
        operation: "remove",
        target: "setting",
        targetId: path,
        path,
        oldValue: value,
        description: `Removed setting "${path}"`,
      });
    } else if (!deepEqualV2(value, newVal)) {
      entries.push({
        operation: "update",
        target: "setting",
        targetId: path,
        path,
        oldValue: value,
        newValue: newVal,
        description: `Updated setting "${path}" from ${JSON.stringify(value)} to ${JSON.stringify(newVal)}`,
      });
    }
  }

  for (const { path, value } of newFlat) {
    if (!oldFlatMap.has(path)) {
      entries.push({
        operation: "add",
        target: "setting",
        targetId: path,
        path,
        newValue: value,
        description: `Added setting "${path}" = ${JSON.stringify(value)}`,
      });
    }
  }

  return entries;
}

// ─── diffSnapshots ────────────────────────────────────────────────────────────

export function diffSnapshots(
  from: WorkflowVersionSnapshot,
  to: WorkflowVersionSnapshot,
): WorkflowDiff {
  const entries: DiffEntry[] = [
    ...diffNodes(from.nodes, to.nodes),
    ...diffEdges(from.edges, to.edges),
    ...diffSettings(from.settings, to.settings),
  ];

  const summary = summarizeDiffEntries(entries);
  const breakingEntries = entries.filter(isBreakingChange);

  return {
    fromVersion: from.version,
    toVersion: to.version,
    entries,
    summary,
    hasBreakingChanges: breakingEntries.length > 0,
    breakingReasons: breakingEntries.map((e) => e.description),
  };
}

// ─── isBreakingChange ─────────────────────────────────────────────────────────

export function isBreakingChange(entry: DiffEntry): boolean {
  if (
    entry.operation === "remove" &&
    (entry.target === "node" || entry.target === "edge")
  ) {
    return true;
  }
  if (
    entry.operation === "update" &&
    entry.target === "node" &&
    entry.path === "type"
  ) {
    return true;
  }
  return false;
}

// ─── summarizeDiffEntries ─────────────────────────────────────────────────────

export function summarizeDiffEntries(
  entries: DiffEntry[],
): WorkflowDiff["summary"] {
  return {
    added: entries.filter((e) => e.operation === "add").length,
    removed: entries.filter((e) => e.operation === "remove").length,
    updated: entries.filter((e) => e.operation === "update").length,
    moved: entries.filter((e) => e.operation === "move").length,
  };
}

// ─── applyDiff ────────────────────────────────────────────────────────────────

export function applyDiff(
  snapshot: WorkflowVersionSnapshot,
  diff: WorkflowDiff,
): WorkflowVersionSnapshot {
  let nodes = [...snapshot.nodes];
  let edges = [...snapshot.edges];
  let settings = { ...snapshot.settings };

  for (const entry of diff.entries) {
    if (entry.target === "node") {
      if (entry.operation === "add" && entry.newValue) {
        nodes.push(entry.newValue as WorkflowNode);
      } else if (entry.operation === "remove") {
        nodes = nodes.filter((n) => n.id !== entry.targetId);
      } else if (entry.operation === "update" || entry.operation === "move") {
        nodes = nodes.map((n) => {
          if (n.id !== entry.targetId) return n;
          if (!entry.path) return n;
          const pathParts = entry.path.split(".");
          if (pathParts[0] === "position") {
            return { ...n, position: entry.newValue as WorkflowNode["position"] };
          }
          if (pathParts.length === 1) {
            return { ...n, [pathParts[0]]: entry.newValue };
          }
          if (pathParts[0] === "config" && pathParts.length > 1) {
            return {
              ...n,
              config: { ...n.config, [pathParts[1]]: entry.newValue },
            };
          }
          return n;
        });
      }
    } else if (entry.target === "edge") {
      if (entry.operation === "add" && entry.newValue) {
        edges.push(entry.newValue as WorkflowEdge);
      } else if (entry.operation === "remove") {
        edges = edges.filter((e) => e.id !== entry.targetId);
      } else if (entry.operation === "update") {
        edges = edges.map((e) => {
          if (e.id !== entry.targetId) return e;
          if (entry.path === "label")
            return { ...e, label: entry.newValue as string };
          if (entry.path === "connection" && entry.newValue) {
            const conn = entry.newValue as { source: string; target: string };
            return { ...e, source: conn.source, target: conn.target };
          }
          return e;
        });
      }
    } else if (entry.target === "setting") {
      if (
        (entry.operation === "add" || entry.operation === "update") &&
        entry.path
      ) {
        settings = { ...settings, [entry.path]: entry.newValue };
      } else if (entry.operation === "remove" && entry.path) {
        const { [entry.path]: _removed, ...rest } = settings;
        settings = rest;
      }
    }
  }

  return { ...snapshot, nodes, edges, settings, version: diff.toVersion };
}

// ─── invertDiff ───────────────────────────────────────────────────────────────

export function invertDiff(diff: WorkflowDiff): WorkflowDiff {
  const inverted = diff.entries.map((entry): DiffEntry => {
    let operation: DiffOperation = entry.operation;
    if (entry.operation === "add") operation = "remove";
    else if (entry.operation === "remove") operation = "add";

    return {
      ...entry,
      operation,
      oldValue: entry.newValue,
      newValue: entry.oldValue,
      description: `[Inverted] ${entry.description}`,
    };
  });

  const summary = summarizeDiffEntries(inverted);
  const breakingEntries = inverted.filter(isBreakingChange);

  return {
    fromVersion: diff.toVersion,
    toVersion: diff.fromVersion,
    entries: inverted,
    summary,
    hasBreakingChanges: breakingEntries.length > 0,
    breakingReasons: breakingEntries.map((e) => e.description),
  };
}

// ─── mergeDiffs ───────────────────────────────────────────────────────────────

export function mergeDiffs(a: WorkflowDiff, b: WorkflowDiff): WorkflowDiff {
  const entries = [...a.entries, ...b.entries];
  const summary = summarizeDiffEntries(entries);
  const breakingEntries = entries.filter(isBreakingChange);

  return {
    fromVersion: a.fromVersion,
    toVersion: b.toVersion,
    entries,
    summary,
    hasBreakingChanges: breakingEntries.length > 0,
    breakingReasons: breakingEntries.map((e) => e.description),
  };
}

// ─── formatDiffEntry ─────────────────────────────────────────────────────────

export function formatDiffEntry(entry: DiffEntry): string {
  const opSymbol: Record<DiffOperation, string> = {
    add: "+",
    remove: "-",
    update: "~",
    move: "→",
  };
  const op = opSymbol[entry.operation] ?? "?";
  const path = entry.path ? ` [${entry.path}]` : "";
  return `[${op}] ${entry.target}:${entry.targetId}${path} — ${entry.description}`;
}

// ─── formatDiff ───────────────────────────────────────────────────────────────

export function formatDiff(diff: WorkflowDiff): string {
  const lines: string[] = [
    `Diff v${diff.fromVersion} → v${diff.toVersion}`,
    `Summary: +${diff.summary.added} -${diff.summary.removed} ~${diff.summary.updated} →${diff.summary.moved}`,
  ];

  if (diff.hasBreakingChanges) {
    lines.push(`Breaking changes: ${diff.breakingReasons.join("; ")}`);
  }

  if (diff.entries.length === 0) {
    lines.push("(no changes)");
  } else {
    for (const entry of diff.entries) {
      lines.push("  " + formatDiffEntry(entry));
    }
  }

  return lines.join("\n");
}

// ─── filterDiff ───────────────────────────────────────────────────────────────

export function filterDiff(diff: WorkflowDiff, targets: DiffTarget[]): WorkflowDiff {
  const targetSet = new Set(targets);
  const entries = diff.entries.filter((e) => targetSet.has(e.target));
  const summary = summarizeDiffEntries(entries);
  const breakingEntries = entries.filter(isBreakingChange);

  return {
    ...diff,
    entries,
    summary,
    hasBreakingChanges: breakingEntries.length > 0,
    breakingReasons: breakingEntries.map((e) => e.description),
  };
}

// ─── isDiffEmpty ──────────────────────────────────────────────────────────────

export function isDiffEmpty(diff: WorkflowDiff): boolean {
  return diff.entries.length === 0;
}
