/**
 * Phase 57 — Workflow Versioning & Snapshot Manager
 * Pure utilities for creating, comparing, tagging, and restoring workflow snapshots.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SnapshotTrigger =
  | "manual"
  | "auto-save"
  | "pre-publish"
  | "post-publish"
  | "import"
  | "rollback";

export type ChangeCategory =
  | "structural"   // nodes/edges added or removed
  | "config"       // node settings changed
  | "metadata"     // name, description, tags changed
  | "settings"     // workflow-level settings
  | "none";        // identical snapshots

export interface WorkflowSnapshot {
  id: string;
  workflowId: string;
  version: number;
  semver: string;         // e.g. "1.3.0"
  trigger: SnapshotTrigger;
  createdAt: Date;
  createdBy: string;      // userId
  label?: string;         // optional human-readable label
  tags: string[];
  checksum: string;       // hash of canonical JSON
  payload: WorkflowPayload;
  parentId?: string;      // previous snapshot id
  changeCategory: ChangeCategory;
  changeSummary: string;
}

export interface WorkflowPayload {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  settings: Record<string, unknown>;
  name: string;
  description?: string;
}

export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface SnapshotDiff {
  fromVersion: number;
  toVersion: number;
  changeCategory: ChangeCategory;
  nodesAdded: string[];
  nodesRemoved: string[];
  nodesModified: string[];
  edgesAdded: string[];
  edgesRemoved: string[];
  settingsChanged: string[];
  metadataChanged: string[];
  changeSummary: string;
}

export interface SnapshotIndex {
  workflowId: string;
  snapshots: Array<{
    id: string;
    version: number;
    semver: string;
    trigger: SnapshotTrigger;
    createdAt: Date;
    createdBy: string;
    label?: string;
    tags: string[];
    checksum: string;
    changeCategory: ChangeCategory;
    changeSummary: string;
    parentId?: string;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Checksum
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute a deterministic checksum from a workflow payload.
 * Sorts nodes and edges by id for stable hashing.
 */
export function computeChecksum(payload: WorkflowPayload): string {
  const canonical = {
    name: payload.name,
    description: payload.description ?? "",
    settings: sortObjectKeys(payload.settings),
    nodes: [...payload.nodes]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((n) => ({ id: n.id, type: n.type, data: sortObjectKeys(n.data) })),
    edges: [...payload.edges]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null, targetHandle: e.targetHandle ?? null })),
  };
  return hashString(JSON.stringify(canonical));
}

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot Creation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new snapshot from a workflow payload.
 */
export function createSnapshot(params: {
  workflowId: string;
  version: number;
  trigger: SnapshotTrigger;
  createdBy: string;
  payload: WorkflowPayload;
  label?: string;
  tags?: string[];
  parentSnapshot?: WorkflowSnapshot;
}): WorkflowSnapshot {
  const { workflowId, version, trigger, createdBy, payload, label, tags = [], parentSnapshot } = params;

  const checksum = computeChecksum(payload);
  const semver = buildSemver(version);
  const changeCategory = parentSnapshot
    ? computeChangeCategory(parentSnapshot.payload, payload)
    : "structural";
  const changeSummary = parentSnapshot
    ? buildChangeSummary(parentSnapshot.payload, payload)
    : "Initial snapshot";

  return {
    id: generateSnapshotId(workflowId, version),
    workflowId,
    version,
    semver,
    trigger,
    createdAt: new Date(),
    createdBy,
    label,
    tags,
    checksum,
    payload,
    parentId: parentSnapshot?.id,
    changeCategory,
    changeSummary,
  };
}

/**
 * Build a semver string from a linear version number.
 * version 1 → "1.0.0", version 10 → "1.9.0", version 100 → "10.0.0"
 */
export function buildSemver(version: number): string {
  if (version <= 0) return "0.0.0";
  const major = Math.floor((version - 1) / 10) + 1;
  const minor = (version - 1) % 10;
  return `${major}.${minor}.0`;
}

/**
 * Parse a semver string back to a linear version number.
 */
export function parseSemver(semver: string): number | null {
  const match = semver.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  const major = parseInt(match[1], 10);
  const minor = parseInt(match[2], 10);
  return (major - 1) * 10 + minor + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Diff & Change Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Diff two snapshots and describe what changed.
 */
export function diffSnapshots(from: WorkflowSnapshot, to: WorkflowSnapshot): SnapshotDiff {
  return {
    fromVersion: from.version,
    toVersion: to.version,
    ...diffPayloads(from.payload, to.payload),
  };
}

/**
 * Diff two workflow payloads directly.
 */
export function diffPayloads(from: WorkflowPayload, to: WorkflowPayload): Omit<SnapshotDiff, "fromVersion" | "toVersion"> {
  const fromNodeIds = new Set(from.nodes.map((n) => n.id));
  const toNodeIds = new Set(to.nodes.map((n) => n.id));

  const nodesAdded = [...toNodeIds].filter((id) => !fromNodeIds.has(id));
  const nodesRemoved = [...fromNodeIds].filter((id) => !toNodeIds.has(id));

  const fromNodeMap = new Map(from.nodes.map((n) => [n.id, n]));
  const toNodeMap = new Map(to.nodes.map((n) => [n.id, n]));
  const nodesModified: string[] = [];
  for (const [id, toNode] of toNodeMap) {
    const fromNode = fromNodeMap.get(id);
    if (fromNode && !isDeepEqual(fromNode.data, toNode.data)) {
      nodesModified.push(id);
    }
  }

  const fromEdgeIds = new Set(from.edges.map((e) => e.id));
  const toEdgeIds = new Set(to.edges.map((e) => e.id));
  const edgesAdded = [...toEdgeIds].filter((id) => !fromEdgeIds.has(id));
  const edgesRemoved = [...fromEdgeIds].filter((id) => !toEdgeIds.has(id));

  const settingsChanged: string[] = [];
  for (const key of new Set([...Object.keys(from.settings), ...Object.keys(to.settings)])) {
    if (!isDeepEqual(from.settings[key], to.settings[key])) {
      settingsChanged.push(key);
    }
  }

  const metadataChanged: string[] = [];
  if (from.name !== to.name) metadataChanged.push("name");
  if ((from.description ?? "") !== (to.description ?? "")) metadataChanged.push("description");

  const changeCategory = classifyChange({
    nodesAdded, nodesRemoved, nodesModified, edgesAdded, edgesRemoved, settingsChanged, metadataChanged,
  });

  const changeSummary = buildChangeSummaryFromParts({
    nodesAdded, nodesRemoved, nodesModified, edgesAdded, edgesRemoved, settingsChanged, metadataChanged,
  });

  return {
    changeCategory,
    nodesAdded,
    nodesRemoved,
    nodesModified,
    edgesAdded,
    edgesRemoved,
    settingsChanged,
    metadataChanged,
    changeSummary,
  };
}

function computeChangeCategory(from: WorkflowPayload, to: WorkflowPayload): ChangeCategory {
  const diff = diffPayloads(from, to);
  return diff.changeCategory;
}

function buildChangeSummary(from: WorkflowPayload, to: WorkflowPayload): string {
  const diff = diffPayloads(from, to);
  return diff.changeSummary;
}

function classifyChange(parts: {
  nodesAdded: string[];
  nodesRemoved: string[];
  nodesModified: string[];
  edgesAdded: string[];
  edgesRemoved: string[];
  settingsChanged: string[];
  metadataChanged: string[];
}): ChangeCategory {
  if (
    parts.nodesAdded.length === 0 &&
    parts.nodesRemoved.length === 0 &&
    parts.nodesModified.length === 0 &&
    parts.edgesAdded.length === 0 &&
    parts.edgesRemoved.length === 0 &&
    parts.settingsChanged.length === 0 &&
    parts.metadataChanged.length === 0
  ) return "none";

  if (parts.nodesAdded.length > 0 || parts.nodesRemoved.length > 0 || parts.edgesAdded.length > 0 || parts.edgesRemoved.length > 0) {
    return "structural";
  }
  if (parts.nodesModified.length > 0) return "config";
  if (parts.settingsChanged.length > 0) return "settings";
  return "metadata";
}

function buildChangeSummaryFromParts(parts: {
  nodesAdded: string[];
  nodesRemoved: string[];
  nodesModified: string[];
  edgesAdded: string[];
  edgesRemoved: string[];
  settingsChanged: string[];
  metadataChanged: string[];
}): string {
  const clauses: string[] = [];
  if (parts.nodesAdded.length > 0) clauses.push(`+${parts.nodesAdded.length} node${parts.nodesAdded.length > 1 ? "s" : ""}`);
  if (parts.nodesRemoved.length > 0) clauses.push(`-${parts.nodesRemoved.length} node${parts.nodesRemoved.length > 1 ? "s" : ""}`);
  if (parts.nodesModified.length > 0) clauses.push(`~${parts.nodesModified.length} node${parts.nodesModified.length > 1 ? "s" : ""} configured`);
  if (parts.edgesAdded.length > 0) clauses.push(`+${parts.edgesAdded.length} edge${parts.edgesAdded.length > 1 ? "s" : ""}`);
  if (parts.edgesRemoved.length > 0) clauses.push(`-${parts.edgesRemoved.length} edge${parts.edgesRemoved.length > 1 ? "s" : ""}`);
  if (parts.settingsChanged.length > 0) clauses.push(`settings updated`);
  if (parts.metadataChanged.length > 0) clauses.push(`metadata updated`);
  return clauses.length > 0 ? clauses.join(", ") : "No changes";
}

// ─────────────────────────────────────────────────────────────────────────────
// Index & Search
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a lightweight index from a list of snapshots.
 */
export function buildSnapshotIndex(snapshots: WorkflowSnapshot[]): SnapshotIndex {
  if (snapshots.length === 0) {
    return { workflowId: "", snapshots: [] };
  }
  const workflowId = snapshots[0].workflowId;
  return {
    workflowId,
    snapshots: snapshots.map((s) => ({
      id: s.id,
      version: s.version,
      semver: s.semver,
      trigger: s.trigger,
      createdAt: s.createdAt,
      createdBy: s.createdBy,
      label: s.label,
      tags: s.tags,
      checksum: s.checksum,
      changeCategory: s.changeCategory,
      changeSummary: s.changeSummary,
      parentId: s.parentId,
    })),
  };
}

/**
 * Find snapshots by tag.
 */
export function findByTag(snapshots: WorkflowSnapshot[], tag: string): WorkflowSnapshot[] {
  return snapshots.filter((s) => s.tags.includes(tag));
}

/**
 * Find snapshots by trigger type.
 */
export function findByTrigger(snapshots: WorkflowSnapshot[], trigger: SnapshotTrigger): WorkflowSnapshot[] {
  return snapshots.filter((s) => s.trigger === trigger);
}

/**
 * Get the latest snapshot (highest version number).
 */
export function getLatestSnapshot(snapshots: WorkflowSnapshot[]): WorkflowSnapshot | null {
  if (snapshots.length === 0) return null;
  return snapshots.reduce((best, s) => (s.version > best.version ? s : best));
}

/**
 * Get snapshots sorted by version descending.
 */
export function sortByVersion(snapshots: WorkflowSnapshot[], order: "asc" | "desc" = "desc"): WorkflowSnapshot[] {
  return [...snapshots].sort((a, b) =>
    order === "desc" ? b.version - a.version : a.version - b.version
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tagging & Labels
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Add tags to a snapshot (deduplicates automatically).
 */
export function addTags(snapshot: WorkflowSnapshot, tags: string[]): WorkflowSnapshot {
  return { ...snapshot, tags: [...new Set([...snapshot.tags, ...tags])] };
}

/**
 * Remove tags from a snapshot.
 */
export function removeTags(snapshot: WorkflowSnapshot, tags: string[]): WorkflowSnapshot {
  const toRemove = new Set(tags);
  return { ...snapshot, tags: snapshot.tags.filter((t) => !toRemove.has(t)) };
}

/**
 * Set the human-readable label on a snapshot.
 */
export function setLabel(snapshot: WorkflowSnapshot, label: string): WorkflowSnapshot {
  return { ...snapshot, label };
}

// ─────────────────────────────────────────────────────────────────────────────
// Restore & Rollback
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a rollback snapshot that restores a previous snapshot's payload.
 * The new snapshot has version = latestVersion + 1 and trigger = "rollback".
 */
export function createRollbackSnapshot(params: {
  targetSnapshot: WorkflowSnapshot;
  latestVersion: number;
  performedBy: string;
}): WorkflowSnapshot {
  const { targetSnapshot, latestVersion, performedBy } = params;
  const version = latestVersion + 1;

  return createSnapshot({
    workflowId: targetSnapshot.workflowId,
    version,
    trigger: "rollback",
    createdBy: performedBy,
    payload: targetSnapshot.payload,
    label: `Rollback to v${targetSnapshot.semver}`,
    tags: ["rollback", `from-v${targetSnapshot.semver}`],
    parentSnapshot: targetSnapshot,
  });
}

/**
 * Validate that a snapshot's checksum matches its payload.
 */
export function validateChecksum(snapshot: WorkflowSnapshot): boolean {
  return computeChecksum(snapshot.payload) === snapshot.checksum;
}

/**
 * Get the restore chain: from root snapshot to the given snapshot.
 */
export function getRestoreChain(
  snapshot: WorkflowSnapshot,
  allSnapshots: WorkflowSnapshot[]
): WorkflowSnapshot[] {
  const chain: WorkflowSnapshot[] = [snapshot];
  const byId = new Map(allSnapshots.map((s) => [s.id, s]));

  let current: WorkflowSnapshot = snapshot;
  while (current.parentId) {
    const parent = byId.get(current.parentId);
    if (!parent) break;
    chain.unshift(parent);
    current = parent;
  }
  return chain;
}

// ─────────────────────────────────────────────────────────────────────────────
// Statistics
// ─────────────────────────────────────────────────────────────────────────────

export interface SnapshotStats {
  total: number;
  latestVersion: number;
  oldestCreatedAt: Date | null;
  latestCreatedAt: Date | null;
  byTrigger: Record<SnapshotTrigger, number>;
  byChangeCategory: Record<ChangeCategory, number>;
  uniqueContributors: string[];
  rollbackCount: number;
}

/**
 * Compute statistics over a list of snapshots.
 */
export function computeSnapshotStats(snapshots: WorkflowSnapshot[]): SnapshotStats {
  const byTrigger: Record<SnapshotTrigger, number> = {
    manual: 0,
    "auto-save": 0,
    "pre-publish": 0,
    "post-publish": 0,
    import: 0,
    rollback: 0,
  };
  const byChangeCategory: Record<ChangeCategory, number> = {
    structural: 0,
    config: 0,
    metadata: 0,
    settings: 0,
    none: 0,
  };

  let latestVersion = 0;
  let oldestCreatedAt: Date | null = null;
  let latestCreatedAt: Date | null = null;
  const contributors = new Set<string>();

  for (const s of snapshots) {
    byTrigger[s.trigger] = (byTrigger[s.trigger] ?? 0) + 1;
    byChangeCategory[s.changeCategory] = (byChangeCategory[s.changeCategory] ?? 0) + 1;
    if (s.version > latestVersion) latestVersion = s.version;
    if (!oldestCreatedAt || s.createdAt < oldestCreatedAt) oldestCreatedAt = s.createdAt;
    if (!latestCreatedAt || s.createdAt > latestCreatedAt) latestCreatedAt = s.createdAt;
    contributors.add(s.createdBy);
  }

  return {
    total: snapshots.length,
    latestVersion,
    oldestCreatedAt,
    latestCreatedAt,
    byTrigger,
    byChangeCategory,
    uniqueContributors: [...contributors],
    rollbackCount: byTrigger.rollback,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function generateSnapshotId(workflowId: string, version: number): string {
  return `snap_${workflowId}_v${version}`;
}

function sortObjectKeys(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))
  );
}

function hashString(str: string): string {
  // FNV-1a 32-bit hash
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function isDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (typeof a !== "object") return false;
  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA).sort();
  const keysB = Object.keys(objB).sort();
  if (keysA.join(",") !== keysB.join(",")) return false;
  return keysA.every((k) => isDeepEqual(objA[k], objB[k]));
}
