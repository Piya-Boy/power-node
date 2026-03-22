/**
 * Phase 75 — Workflow Change Feed
 * Pure utilities for recording workflow mutations, computing change
 * summaries, replaying history, and producing structured changelogs.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ChangeOperation = "create" | "update" | "delete" | "rename" | "move" | "reorder";

export type ChangeTarget =
  | "workflow"
  | "node"
  | "edge"
  | "setting"
  | "trigger"
  | "tag"
  | "credential"
  | "variable"
  | "schedule";

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface ChangeRecord {
  id: string;
  workflowId: string;
  timestamp: Date;
  authorId: string;
  operation: ChangeOperation;
  target: ChangeTarget;
  targetId: string;
  targetLabel?: string;         // human-readable name/label of the target
  changes: FieldChange[];       // field-level diffs
  description?: string;         // optional human summary
  metadata?: Record<string, unknown>;
}

export interface ChangeGroup {
  groupId: string;
  workflowId: string;
  authorId: string;
  startedAt: Date;
  endedAt: Date;
  records: ChangeRecord[];
  summary: string;
}

export interface ChangeStats {
  totalChanges: number;
  byOperation: Record<ChangeOperation, number>;
  byTarget: Partial<Record<ChangeTarget, number>>;
  byAuthor: Array<{ authorId: string; count: number }>;
  mostChangedTargetIds: Array<{ targetId: string; target: ChangeTarget; count: number }>;
  lastChanged: Date | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Change Record Creation
// ─────────────────────────────────────────────────────────────────────────────

let _idSeq = 0;
export function resetChangeIdSeq(): void { _idSeq = 0; }

/**
 * Create a new change record.
 */
export function createChangeRecord(
  params: Omit<ChangeRecord, "id" | "timestamp"> & { id?: string; timestamp?: Date }
): ChangeRecord {
  return {
    id: params.id ?? `chg_${++_idSeq}`,
    timestamp: params.timestamp ?? new Date(),
    workflowId: params.workflowId,
    authorId: params.authorId,
    operation: params.operation,
    target: params.target,
    targetId: params.targetId,
    targetLabel: params.targetLabel,
    changes: params.changes,
    description: params.description,
    metadata: params.metadata,
  };
}

/**
 * Compute field-level changes by comparing before/after objects.
 */
export function diffObjects(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  ignoreKeys: string[] = []
): FieldChange[] {
  const ignored = new Set(ignoreKeys);
  const changes: FieldChange[] = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    if (ignored.has(key)) continue;
    const prev = before[key];
    const next = after[key];
    if (!deepEqual(prev, next)) {
      changes.push({ field: key, before: prev, after: next });
    }
  }
  return changes;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const aa = a as unknown[];
    const bb = b as unknown[];
    if (aa.length !== bb.length) return false;
    return aa.every((v, i) => deepEqual(v, bb[i]));
  }
  const oa = a as Record<string, unknown>;
  const ob = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(oa), ...Object.keys(ob)]);
  for (const k of keys) {
    if (!deepEqual(oa[k], ob[k])) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Querying
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Filter changes by workflow.
 */
export function getWorkflowChanges(
  records: ChangeRecord[],
  workflowId: string
): ChangeRecord[] {
  return records.filter((r) => r.workflowId === workflowId);
}

/**
 * Filter changes by author.
 */
export function getAuthorChanges(records: ChangeRecord[], authorId: string): ChangeRecord[] {
  return records.filter((r) => r.authorId === authorId);
}

/**
 * Filter changes by target type and optional ID.
 */
export function getTargetChanges(
  records: ChangeRecord[],
  target: ChangeTarget,
  targetId?: string
): ChangeRecord[] {
  return records.filter(
    (r) => r.target === target && (targetId === undefined || r.targetId === targetId)
  );
}

/**
 * Filter changes within a time window.
 */
export function getChangesInWindow(
  records: ChangeRecord[],
  from: Date,
  to: Date
): ChangeRecord[] {
  return records.filter((r) => r.timestamp >= from && r.timestamp <= to);
}

/**
 * Get the most recent N changes (sorted by timestamp desc).
 */
export function getRecentChanges(records: ChangeRecord[], n: number): ChangeRecord[] {
  return [...records]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, n);
}

/**
 * Find changes that modified a specific field.
 */
export function getChangesForField(
  records: ChangeRecord[],
  field: string
): ChangeRecord[] {
  return records.filter((r) => r.changes.some((c) => c.field === field));
}

// ─────────────────────────────────────────────────────────────────────────────
// Grouping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Group consecutive records by the same author within a time gap.
 * Records from the same author within `gapMs` of each other form one group.
 */
export function groupChangesBySession(
  records: ChangeRecord[],
  gapMs = 300_000  // 5 minutes
): ChangeGroup[] {
  if (records.length === 0) return [];

  const sorted = [...records].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const groups: ChangeGroup[] = [];
  let groupSeq = 0;
  let current: ChangeRecord[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const gap = curr.timestamp.getTime() - prev.timestamp.getTime();
    if (curr.authorId === prev.authorId && gap <= gapMs) {
      current.push(curr);
    } else {
      groups.push(buildGroup(`grp_${++groupSeq}`, current));
      current = [curr];
    }
  }
  if (current.length > 0) groups.push(buildGroup(`grp_${++groupSeq}`, current));

  return groups;
}

function buildGroup(groupId: string, records: ChangeRecord[]): ChangeGroup {
  const ops = [...new Set(records.map((r) => r.operation))];
  const targets = [...new Set(records.map((r) => r.target))];
  const summary = `${ops.join("/")} ${targets.join("/")} (${records.length} change${records.length !== 1 ? "s" : ""})`;
  return {
    groupId,
    workflowId: records[0].workflowId,
    authorId: records[0].authorId,
    startedAt: records[0].timestamp,
    endedAt: records[records.length - 1].timestamp,
    records,
    summary,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// History Replay
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replay change records forward and return the final state of a target object.
 * Applies `update` changes only.
 */
export function replayChanges(
  initial: Record<string, unknown>,
  records: ChangeRecord[],
  targetId: string
): Record<string, unknown> {
  let state = { ...initial };
  const sorted = [...records]
    .filter((r) => r.targetId === targetId && r.operation === "update")
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  for (const record of sorted) {
    for (const change of record.changes) {
      state = { ...state, [change.field]: change.after };
    }
  }
  return state;
}

/**
 * Get the value of a field at a specific point in time.
 */
export function getFieldAtTime(
  records: ChangeRecord[],
  targetId: string,
  field: string,
  asOf: Date
): unknown {
  const relevant = records
    .filter((r) => r.targetId === targetId && r.timestamp <= asOf)
    .filter((r) => r.changes.some((c) => c.field === field))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  for (let i = relevant.length - 1; i >= 0; i--) {
    const change = relevant[i].changes.find((c) => c.field === field);
    if (change) return change.after;
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Changelog Generation
// ─────────────────────────────────────────────────────────────────────────────

export interface ChangelogEntry {
  date: string;           // ISO date "YYYY-MM-DD"
  changes: Array<{
    operation: ChangeOperation;
    target: ChangeTarget;
    targetLabel?: string;
    description: string;
    authorId: string;
  }>;
}

/**
 * Build a human-readable changelog grouped by date.
 */
export function buildChangelog(records: ChangeRecord[]): ChangelogEntry[] {
  const byDate = new Map<string, ChangeRecord[]>();

  for (const record of records) {
    const dateKey = record.timestamp.toISOString().slice(0, 10);
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey)!.push(record);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a)) // newest first
    .map(([date, recs]) => ({
      date,
      changes: recs
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .map((r) => ({
          operation: r.operation,
          target: r.target,
          targetLabel: r.targetLabel,
          description: r.description ?? formatDescription(r),
          authorId: r.authorId,
        })),
    }));
}

function formatDescription(record: ChangeRecord): string {
  const label = record.targetLabel ?? record.targetId;
  const changedFields = record.changes.map((c) => c.field).join(", ");
  switch (record.operation) {
    case "create": return `Created ${record.target} "${label}"`;
    case "update": return `Updated ${record.target} "${label}" (${changedFields || "no fields"})`;
    case "delete": return `Deleted ${record.target} "${label}"`;
    case "rename": return `Renamed ${record.target} "${label}"`;
    case "move": return `Moved ${record.target} "${label}"`;
    case "reorder": return `Reordered ${record.target}`;
    default: return `Changed ${record.target} "${label}"`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Statistics
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute change statistics.
 */
export function computeChangeStats(records: ChangeRecord[]): ChangeStats {
  const byOperation: Record<ChangeOperation, number> = {
    create: 0, update: 0, delete: 0, rename: 0, move: 0, reorder: 0,
  };
  const byTarget: Partial<Record<ChangeTarget, number>> = {};
  const authorCounts = new Map<string, number>();
  const targetCounts = new Map<string, { target: ChangeTarget; count: number }>();

  for (const record of records) {
    byOperation[record.operation]++;
    byTarget[record.target] = (byTarget[record.target] ?? 0) + 1;
    authorCounts.set(record.authorId, (authorCounts.get(record.authorId) ?? 0) + 1);
    const key = `${record.target}:${record.targetId}`;
    const existing = targetCounts.get(key);
    if (existing) existing.count++;
    else targetCounts.set(key, { target: record.target, count: 1 });
  }

  const byAuthor = [...authorCounts.entries()]
    .map(([authorId, count]) => ({ authorId, count }))
    .sort((a, b) => b.count - a.count);

  const mostChangedTargetIds = [...targetCounts.entries()]
    .map(([key, info]) => ({ targetId: key.split(":").slice(1).join(":"), ...info }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const timestamps = records.map((r) => r.timestamp);
  const lastChanged = timestamps.length > 0
    ? new Date(Math.max(...timestamps.map((t) => t.getTime())))
    : undefined;

  return {
    totalChanges: records.length,
    byOperation,
    byTarget,
    byAuthor,
    mostChangedTargetIds,
    lastChanged,
  };
}
