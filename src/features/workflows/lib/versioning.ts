/**
 * Phase 25 — Workflow Versioning
 * Pure utilities for tracking and comparing workflow versions.
 */

export interface WorkflowSnapshot {
  version: number;
  workflowId: string;
  name: string;
  nodes: SnapshotNode[];
  connections: SnapshotConnection[];
  createdAt: Date;
  createdBy: string;
  message?: string; // optional commit-like message
}

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

export interface VersionDiff {
  addedNodes: string[];      // node ids added
  removedNodes: string[];    // node ids removed
  modifiedNodes: string[];   // node ids with changed data/position
  addedConnections: string[];
  removedConnections: string[];
  nameChanged: boolean;
}

/**
 * Create a snapshot of the current workflow state.
 */
export function createSnapshot(params: {
  version: number;
  workflowId: string;
  name: string;
  nodes: SnapshotNode[];
  connections: SnapshotConnection[];
  createdBy: string;
  message?: string;
}): WorkflowSnapshot {
  return {
    ...params,
    createdAt: new Date(),
  };
}

/**
 * Compute the next version number from a list of snapshots.
 * Returns 1 if no snapshots exist.
 */
export function nextVersion(snapshots: WorkflowSnapshot[]): number {
  if (snapshots.length === 0) return 1;
  return Math.max(...snapshots.map((s) => s.version)) + 1;
}

/**
 * Get the latest snapshot from a list.
 */
export function getLatestSnapshot(
  snapshots: WorkflowSnapshot[]
): WorkflowSnapshot | null {
  if (snapshots.length === 0) return null;
  return snapshots.reduce((a, b) => (a.version > b.version ? a : b));
}

/**
 * Get a specific version snapshot.
 */
export function getSnapshotByVersion(
  snapshots: WorkflowSnapshot[],
  version: number
): WorkflowSnapshot | null {
  return snapshots.find((s) => s.version === version) ?? null;
}

/**
 * Diff two workflow snapshots to see what changed.
 */
export function diffSnapshots(
  from: WorkflowSnapshot,
  to: WorkflowSnapshot
): VersionDiff {
  const fromNodeIds = new Set(from.nodes.map((n) => n.id));
  const toNodeIds = new Set(to.nodes.map((n) => n.id));

  const addedNodes = [...toNodeIds].filter((id) => !fromNodeIds.has(id));
  const removedNodes = [...fromNodeIds].filter((id) => !toNodeIds.has(id));

  const modifiedNodes: string[] = [];
  for (const toNode of to.nodes) {
    if (!fromNodeIds.has(toNode.id)) continue;
    const fromNode = from.nodes.find((n) => n.id === toNode.id)!;
    if (
      JSON.stringify(fromNode.data) !== JSON.stringify(toNode.data) ||
      fromNode.position.x !== toNode.position.x ||
      fromNode.position.y !== toNode.position.y ||
      fromNode.name !== toNode.name
    ) {
      modifiedNodes.push(toNode.id);
    }
  }

  const fromConnIds = new Set(from.connections.map((c) => c.id));
  const toConnIds = new Set(to.connections.map((c) => c.id));
  const addedConnections = [...toConnIds].filter((id) => !fromConnIds.has(id));
  const removedConnections = [...fromConnIds].filter((id) => !toConnIds.has(id));

  return {
    addedNodes,
    removedNodes,
    modifiedNodes,
    addedConnections,
    removedConnections,
    nameChanged: from.name !== to.name,
  };
}

/**
 * Check if a diff has any changes.
 */
export function hasChanges(diff: VersionDiff): boolean {
  return (
    diff.addedNodes.length > 0 ||
    diff.removedNodes.length > 0 ||
    diff.modifiedNodes.length > 0 ||
    diff.addedConnections.length > 0 ||
    diff.removedConnections.length > 0 ||
    diff.nameChanged
  );
}

/**
 * Summarize a diff in human-readable form.
 */
export function describeDiff(diff: VersionDiff): string {
  const parts: string[] = [];
  if (diff.nameChanged) parts.push("renamed workflow");
  if (diff.addedNodes.length) parts.push(`added ${diff.addedNodes.length} node(s)`);
  if (diff.removedNodes.length) parts.push(`removed ${diff.removedNodes.length} node(s)`);
  if (diff.modifiedNodes.length) parts.push(`modified ${diff.modifiedNodes.length} node(s)`);
  if (diff.addedConnections.length) parts.push(`added ${diff.addedConnections.length} connection(s)`);
  if (diff.removedConnections.length) parts.push(`removed ${diff.removedConnections.length} connection(s)`);
  if (parts.length === 0) return "No changes";
  return parts.join(", ");
}

/**
 * Trim snapshots to keep only the latest N versions.
 */
export function trimSnapshots(
  snapshots: WorkflowSnapshot[],
  keepLatest: number
): WorkflowSnapshot[] {
  if (snapshots.length <= keepLatest) return snapshots;
  return [...snapshots]
    .sort((a, b) => b.version - a.version)
    .slice(0, keepLatest);
}
