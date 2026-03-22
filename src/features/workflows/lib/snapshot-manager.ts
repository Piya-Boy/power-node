export type SnapshotStatus = "active" | "archived" | "deleted";
export type SnapshotTrigger = "manual" | "auto" | "pre_deploy" | "checkpoint" | "rollback";

export interface WorkflowSnapshot {
  id: string;
  workflowId: string;
  version: number;
  label?: string;
  trigger: SnapshotTrigger;
  status: SnapshotStatus;
  data: Record<string, unknown>;
  checksum: string;
  sizeBytes: number;
  createdAt: number;
  archivedAt?: number;
  tags: string[];
  parentId?: string;
}

export interface SnapshotDiff {
  added: string[];
  removed: string[];
  changed: string[];
  unchanged: string[];
  hasChanges: boolean;
}

export interface SnapshotStore {
  snapshots: WorkflowSnapshot[];
  maxSnapshots: number;
  workflowId: string;
}

let _snapSeq = 0;
export function resetSnapSeq(): void { _snapSeq = 0; }

function simpleChecksum(data: Record<string, unknown>): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = Math.imul(31, hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return "csum_" + Math.abs(hash).toString(16);
}

export function createSnapshot(
  workflowId: string,
  data: Record<string, unknown>,
  options: {
    label?: string;
    trigger?: SnapshotTrigger;
    tags?: string[];
    parentId?: string;
  } = {},
  now = Date.now()
): WorkflowSnapshot {
  const serialized = JSON.stringify(data);
  return {
    id: "snap_" + (++_snapSeq),
    workflowId,
    version: _snapSeq,
    label: options.label,
    trigger: options.trigger ?? "manual",
    status: "active",
    data,
    checksum: simpleChecksum(data),
    sizeBytes: new TextEncoder().encode(serialized).length,
    createdAt: now,
    tags: options.tags ?? [],
    parentId: options.parentId,
  };
}

export function createStore(workflowId: string, maxSnapshots = 50): SnapshotStore {
  return { snapshots: [], maxSnapshots, workflowId };
}

export function addSnapshot(store: SnapshotStore, snapshot: WorkflowSnapshot): SnapshotStore {
  const snapshots = [...store.snapshots, snapshot];
  return { ...store, snapshots };
}

export function pruneSnapshots(store: SnapshotStore): SnapshotStore {
  const active = store.snapshots.filter((s) => s.status === "active");
  if (active.length <= store.maxSnapshots) return store;
  const excess = active.length - store.maxSnapshots;
  const toArchive = active.slice(0, excess).map((s) => s.id);
  const snapshots = store.snapshots.map((s) =>
    toArchive.includes(s.id) ? { ...s, status: "archived" as SnapshotStatus } : s
  );
  return { ...store, snapshots };
}

export function getSnapshot(store: SnapshotStore, id: string): WorkflowSnapshot | undefined {
  return store.snapshots.find((s) => s.id === id);
}

export function getLatestSnapshot(store: SnapshotStore): WorkflowSnapshot | undefined {
  const active = store.snapshots.filter((s) => s.status === "active");
  if (active.length === 0) return undefined;
  return active[active.length - 1];
}

export function getSnapshotsByTrigger(store: SnapshotStore, trigger: SnapshotTrigger): WorkflowSnapshot[] {
  return store.snapshots.filter((s) => s.trigger === trigger);
}

export function getSnapshotsByTag(store: SnapshotStore, tag: string): WorkflowSnapshot[] {
  return store.snapshots.filter((s) => s.tags.includes(tag));
}

export function archiveSnapshot(store: SnapshotStore, id: string, now = Date.now()): SnapshotStore {
  const snapshots = store.snapshots.map((s) =>
    s.id === id ? { ...s, status: "archived" as SnapshotStatus, archivedAt: now } : s
  );
  return { ...store, snapshots };
}

export function deleteSnapshot(store: SnapshotStore, id: string): SnapshotStore {
  const snapshots = store.snapshots.map((s) =>
    s.id === id ? { ...s, status: "deleted" as SnapshotStatus } : s
  );
  return { ...store, snapshots };
}

export function diffSnapshots(a: WorkflowSnapshot, b: WorkflowSnapshot): SnapshotDiff {
  const keysA = new Set(Object.keys(a.data));
  const keysB = new Set(Object.keys(b.data));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  const unchanged: string[] = [];
  for (const key of keysB) {
    if (!keysA.has(key)) added.push(key);
  }
  for (const key of keysA) {
    if (!keysB.has(key)) {
      removed.push(key);
    } else {
      const aVal = JSON.stringify(a.data[key]);
      const bVal = JSON.stringify(b.data[key]);
      if (aVal !== bVal) changed.push(key);
      else unchanged.push(key);
    }
  }
  return { added, removed, changed, unchanged, hasChanges: added.length > 0 || removed.length > 0 || changed.length > 0 };
}

export function isIdentical(a: WorkflowSnapshot, b: WorkflowSnapshot): boolean {
  return a.checksum === b.checksum;
}

export function restoreSnapshot(snapshot: WorkflowSnapshot): Record<string, unknown> {
  return { ...snapshot.data };
}

export function labelSnapshot(store: SnapshotStore, id: string, label: string): SnapshotStore {
  const snapshots = store.snapshots.map((s) => s.id === id ? { ...s, label } : s);
  return { ...store, snapshots };
}

export function tagSnapshot(store: SnapshotStore, id: string, tag: string): SnapshotStore {
  const snapshots = store.snapshots.map((s) =>
    s.id === id ? { ...s, tags: s.tags.includes(tag) ? s.tags : [...s.tags, tag] } : s
  );
  return { ...store, snapshots };
}

export interface SnapshotStats {
  total: number;
  active: number;
  archived: number;
  deleted: number;
  totalSizeBytes: number;
  latestVersion: number;
  byTrigger: Record<SnapshotTrigger, number>;
}

export function getStoreStats(store: SnapshotStore): SnapshotStats {
  const byTrigger: Record<SnapshotTrigger, number> = { manual: 0, auto: 0, pre_deploy: 0, checkpoint: 0, rollback: 0 };
  let active = 0, archived = 0, deleted = 0, totalSizeBytes = 0, latestVersion = 0;
  for (const s of store.snapshots) {
    byTrigger[s.trigger]++;
    totalSizeBytes += s.sizeBytes;
    if (s.version > latestVersion) latestVersion = s.version;
    if (s.status === "active") active++;
    else if (s.status === "archived") archived++;
    else if (s.status === "deleted") deleted++;
  }
  return { total: store.snapshots.length, active, archived, deleted, totalSizeBytes, latestVersion, byTrigger };
}

export function findByParent(store: SnapshotStore, parentId: string): WorkflowSnapshot[] {
  return store.snapshots.filter((s) => s.parentId === parentId);
}
