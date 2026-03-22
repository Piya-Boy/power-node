/**
 * Phase 71 — Workflow Access Log
 * Pure utilities for recording, querying, and summarizing
 * access and mutation events across workflows and resources.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AccessAction =
  | "view"
  | "create"
  | "update"
  | "delete"
  | "execute"
  | "clone"
  | "export"
  | "import"
  | "share"
  | "revoke"
  | "login"
  | "logout"
  | "api_call";

export type ResourceType =
  | "workflow"
  | "execution"
  | "credential"
  | "user"
  | "team"
  | "api_key"
  | "template"
  | "schedule"
  | "webhook";

export type AccessOutcome = "success" | "denied" | "error";

export interface AccessLogEntry {
  id: string;
  timestamp: Date;
  actorId: string;          // user or service account ID
  actorType: "user" | "service" | "system";
  action: AccessAction;
  resourceType: ResourceType;
  resourceId: string;
  outcome: AccessOutcome;
  ipAddress?: string;
  userAgent?: string;
  duration?: number;        // ms for the operation
  metadata?: Record<string, unknown>;
  reason?: string;          // for denials/errors
}

export interface AccessLogFilter {
  actorId?: string;
  actorType?: AccessLogEntry["actorType"];
  actions?: AccessAction[];
  resourceTypes?: ResourceType[];
  resourceId?: string;
  outcomes?: AccessOutcome[];
  from?: Date;
  to?: Date;
  ipAddress?: string;
  search?: string;          // substring in reason/metadata
}

export interface AccessSummary {
  totalEvents: number;
  successCount: number;
  deniedCount: number;
  errorCount: number;
  uniqueActors: number;
  uniqueResources: number;
  topActions: Array<{ action: AccessAction; count: number }>;
  topActors: Array<{ actorId: string; count: number }>;
  topResources: Array<{ resourceId: string; resourceType: ResourceType; count: number }>;
  denialRate: number;       // 0–100
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry Creation
// ─────────────────────────────────────────────────────────────────────────────

let _idCounter = 0;

/**
 * Create a new access log entry.
 */
export function createEntry(
  params: Omit<AccessLogEntry, "id" | "timestamp"> & { id?: string; timestamp?: Date }
): AccessLogEntry {
  return {
    id: params.id ?? `log_${++_idCounter}`,
    timestamp: params.timestamp ?? new Date(),
    actorId: params.actorId,
    actorType: params.actorType,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    outcome: params.outcome,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    duration: params.duration,
    metadata: params.metadata,
    reason: params.reason,
  };
}

/**
 * Reset the internal ID counter (useful for testing).
 */
export function resetIdCounter(): void {
  _idCounter = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Filter access log entries by a set of criteria.
 */
export function filterEntries(
  entries: AccessLogEntry[],
  filter: AccessLogFilter
): AccessLogEntry[] {
  return entries.filter((e) => {
    if (filter.actorId && e.actorId !== filter.actorId) return false;
    if (filter.actorType && e.actorType !== filter.actorType) return false;
    if (filter.actions && !filter.actions.includes(e.action)) return false;
    if (filter.resourceTypes && !filter.resourceTypes.includes(e.resourceType)) return false;
    if (filter.resourceId && e.resourceId !== filter.resourceId) return false;
    if (filter.outcomes && !filter.outcomes.includes(e.outcome)) return false;
    if (filter.from && e.timestamp < filter.from) return false;
    if (filter.to && e.timestamp > filter.to) return false;
    if (filter.ipAddress && e.ipAddress !== filter.ipAddress) return false;
    if (filter.search) {
      const q = filter.search.toLowerCase();
      const inReason = e.reason?.toLowerCase().includes(q) ?? false;
      const inMeta = e.metadata
        ? JSON.stringify(e.metadata).toLowerCase().includes(q)
        : false;
      if (!inReason && !inMeta) return false;
    }
    return true;
  });
}

/**
 * Get entries within a time range (inclusive).
 */
export function getEntriesInRange(
  entries: AccessLogEntry[],
  from: Date,
  to: Date
): AccessLogEntry[] {
  return entries.filter((e) => e.timestamp >= from && e.timestamp <= to);
}

/**
 * Get all entries for a specific actor.
 */
export function getActorHistory(entries: AccessLogEntry[], actorId: string): AccessLogEntry[] {
  return entries.filter((e) => e.actorId === actorId);
}

/**
 * Get all entries for a specific resource.
 */
export function getResourceHistory(
  entries: AccessLogEntry[],
  resourceType: ResourceType,
  resourceId: string
): AccessLogEntry[] {
  return entries.filter((e) => e.resourceType === resourceType && e.resourceId === resourceId);
}

/**
 * Get entries where access was denied.
 */
export function getDeniedEntries(entries: AccessLogEntry[]): AccessLogEntry[] {
  return entries.filter((e) => e.outcome === "denied");
}

// ─────────────────────────────────────────────────────────────────────────────
// Sorting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sort entries by timestamp (newest first by default).
 */
export function sortEntries(
  entries: AccessLogEntry[],
  order: "asc" | "desc" = "desc"
): AccessLogEntry[] {
  return [...entries].sort((a, b) =>
    order === "desc"
      ? b.timestamp.getTime() - a.timestamp.getTime()
      : a.timestamp.getTime() - b.timestamp.getTime()
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Anomaly Detection
// ─────────────────────────────────────────────────────────────────────────────

export interface AnomalyResult {
  type: "high_denial_rate" | "rapid_access" | "unusual_ip" | "bulk_delete";
  actorId: string;
  description: string;
  severity: "warning" | "critical";
  count: number;
}

/**
 * Detect access anomalies from a set of recent entries.
 */
export function detectAnomalies(
  entries: AccessLogEntry[],
  options: {
    denialRateThreshold?: number;     // default: 30 (%)
    rapidAccessWindowMs?: number;     // default: 60_000 (1 min)
    rapidAccessThreshold?: number;    // default: 20 calls
    bulkDeleteThreshold?: number;     // default: 5
    knownIpAddresses?: string[];
  } = {}
): AnomalyResult[] {
  const {
    denialRateThreshold = 30,
    rapidAccessWindowMs = 60_000,
    rapidAccessThreshold = 20,
    bulkDeleteThreshold = 5,
    knownIpAddresses = [],
  } = options;

  const anomalies: AnomalyResult[] = [];

  // Group by actor
  const byActor = new Map<string, AccessLogEntry[]>();
  for (const entry of entries) {
    if (!byActor.has(entry.actorId)) byActor.set(entry.actorId, []);
    byActor.get(entry.actorId)!.push(entry);
  }

  for (const [actorId, actorEntries] of byActor.entries()) {
    // High denial rate
    const denied = actorEntries.filter((e) => e.outcome === "denied").length;
    const denialRate = actorEntries.length > 0 ? (denied / actorEntries.length) * 100 : 0;
    if (denialRate >= denialRateThreshold && denied >= 3) {
      anomalies.push({
        type: "high_denial_rate",
        actorId,
        description: `${denialRate.toFixed(0)}% of requests denied (${denied}/${actorEntries.length})`,
        severity: denialRate >= 60 ? "critical" : "warning",
        count: denied,
      });
    }

    // Rapid access
    const sorted = [...actorEntries].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    for (let i = 0; i < sorted.length; i++) {
      const windowEnd = sorted[i].timestamp.getTime() + rapidAccessWindowMs;
      let j = i;
      while (j < sorted.length && sorted[j].timestamp.getTime() <= windowEnd) j++;
      const windowCount = j - i;
      if (windowCount >= rapidAccessThreshold) {
        anomalies.push({
          type: "rapid_access",
          actorId,
          description: `${windowCount} requests within ${rapidAccessWindowMs / 1000}s`,
          severity: "warning",
          count: windowCount,
        });
        break; // one anomaly per actor
      }
    }

    // Bulk delete
    const deletes = actorEntries.filter((e) => e.action === "delete");
    if (deletes.length >= bulkDeleteThreshold) {
      anomalies.push({
        type: "bulk_delete",
        actorId,
        description: `${deletes.length} delete operations detected`,
        severity: deletes.length >= bulkDeleteThreshold * 2 ? "critical" : "warning",
        count: deletes.length,
      });
    }

    // Unusual IP
    if (knownIpAddresses.length > 0) {
      const unknownIps = actorEntries
        .filter((e) => e.ipAddress && !knownIpAddresses.includes(e.ipAddress))
        .map((e) => e.ipAddress!);
      if (unknownIps.length > 0) {
        const uniqueUnknown = [...new Set(unknownIps)];
        anomalies.push({
          type: "unusual_ip",
          actorId,
          description: `Access from ${uniqueUnknown.length} unknown IP(s): ${uniqueUnknown.join(", ")}`,
          severity: "warning",
          count: unknownIps.length,
        });
      }
    }
  }

  return anomalies;
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute a summary of access log entries.
 */
export function summarizeEntries(entries: AccessLogEntry[]): AccessSummary {
  const totalEvents = entries.length;
  const successCount = entries.filter((e) => e.outcome === "success").length;
  const deniedCount = entries.filter((e) => e.outcome === "denied").length;
  const errorCount = entries.filter((e) => e.outcome === "error").length;
  const uniqueActors = new Set(entries.map((e) => e.actorId)).size;
  const uniqueResources = new Set(entries.map((e) => `${e.resourceType}:${e.resourceId}`)).size;
  const denialRate = totalEvents > 0 ? Math.round((deniedCount / totalEvents) * 1000) / 10 : 0;

  // Top actions
  const actionCounts = new Map<AccessAction, number>();
  for (const e of entries) actionCounts.set(e.action, (actionCounts.get(e.action) ?? 0) + 1);
  const topActions = [...actionCounts.entries()]
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Top actors
  const actorCounts = new Map<string, number>();
  for (const e of entries) actorCounts.set(e.actorId, (actorCounts.get(e.actorId) ?? 0) + 1);
  const topActors = [...actorCounts.entries()]
    .map(([actorId, count]) => ({ actorId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Top resources
  const resourceCounts = new Map<string, { resourceType: ResourceType; count: number }>();
  for (const e of entries) {
    const key = `${e.resourceType}:${e.resourceId}`;
    const existing = resourceCounts.get(key);
    if (existing) existing.count++;
    else resourceCounts.set(key, { resourceType: e.resourceType, count: 1 });
  }
  const topResources = [...resourceCounts.entries()]
    .map(([key, info]) => ({ resourceId: key.split(":")[1], ...info }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalEvents,
    successCount,
    deniedCount,
    errorCount,
    uniqueActors,
    uniqueResources,
    topActions,
    topActors,
    topResources,
    denialRate,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pagination
// ─────────────────────────────────────────────────────────────────────────────

export interface PaginatedEntries {
  entries: AccessLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * Paginate an array of entries.
 */
export function paginateEntries(
  entries: AccessLogEntry[],
  page: number,
  pageSize: number
): PaginatedEntries {
  const total = entries.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * pageSize;
  const sliced = entries.slice(start, start + pageSize);

  return {
    entries: sliced,
    total,
    page: safePage,
    pageSize,
    totalPages,
    hasNext: safePage < totalPages,
    hasPrev: safePage > 1,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Retention
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Remove entries older than the given retention period.
 */
export function applyRetention(entries: AccessLogEntry[], retentionDays: number): {
  retained: AccessLogEntry[];
  purged: number;
} {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  const retained = entries.filter((e) => e.timestamp >= cutoff);
  return { retained, purged: entries.length - retained.length };
}
