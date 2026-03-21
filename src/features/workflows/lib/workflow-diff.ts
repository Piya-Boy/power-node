/**
 * Workflow diffing utilities for comparing workflow snapshots.
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
