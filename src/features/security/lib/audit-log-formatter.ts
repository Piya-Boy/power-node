/**
 * Phase 47 — Audit Log Formatter
 * Pure utilities for creating, formatting, filtering, and analysing structured
 * audit events. Supports human-readable, JSON, CEF, LEEF, and CSV output.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AuditSeverity = "low" | "medium" | "high" | "critical";
export type AuditOutcome = "success" | "failure" | "unknown";
export type ExportFormat = "json" | "csv" | "cef";

export interface AuditEvent {
  id: string;
  timestamp: string;           // ISO 8601
  action: string;              // e.g. "user.login", "workflow.delete"
  actor: AuditActor;
  resource: AuditResource;
  outcome: AuditOutcome;
  severity: AuditSeverity;
  metadata?: Record<string, unknown>;
  requestId?: string;
  sessionId?: string;
}

export interface AuditActor {
  id: string;
  type: "user" | "service" | "system";
  email?: string;
  ip?: string;
  userAgent?: string;
}

export interface AuditResource {
  type: string;
  id: string;
  name?: string;
  workspaceId?: string;
}

export interface AuditFilter {
  fromDate?: string;
  toDate?: string;
  userId?: string;
  action?: string;
  resourceType?: string;
  outcome?: AuditOutcome;
  severity?: AuditSeverity;
  ip?: string;
}

export type GroupByField = "action" | "actor.id" | "resource.type" | "severity" | "outcome" | "date";

export interface AuditStats {
  total: number;
  byOutcome: Record<AuditOutcome, number>;
  bySeverity: Record<AuditSeverity, number>;
  byAction: Record<string, number>;
  byActor: Record<string, number>;
  successRate: number;
  period: { from: string; to: string };
}

export interface AnomalyResult {
  type: string;
  description: string;
  events: AuditEvent[];
  severity: AuditSeverity;
}

export interface AuditReport {
  generatedAt: string;
  title: string;
  summary: string;
  stats: AuditStats;
  anomalies: AnomalyResult[];
  topActions: Array<{ action: string; count: number }>;
  topActors: Array<{ actorId: string; count: number }>;
}

export interface AnomalyThresholds {
  failedLoginsPerMinute?: number;
  actionsPerMinute?: number;
  uniqueIpsPerHour?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// createAuditEvent
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a structured audit event with sensible defaults.
 */
export function createAuditEvent(
  params: Omit<AuditEvent, "id" | "timestamp"> & Partial<Pick<AuditEvent, "id" | "timestamp">>
): AuditEvent {
  return {
    id: params.id ?? generateId(),
    timestamp: params.timestamp ?? new Date().toISOString(),
    action: params.action,
    actor: params.actor,
    resource: params.resource,
    outcome: params.outcome,
    severity: params.severity,
    metadata: params.metadata,
    requestId: params.requestId,
    sessionId: params.sessionId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// formatAuditEvent  (human-readable)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format an audit event as a human-readable single-line string.
 */
export function formatAuditEvent(event: AuditEvent): string {
  const actor = event.actor.email ?? event.actor.id;
  const resource = event.resource.name
    ? `${event.resource.type}/${event.resource.name}`
    : `${event.resource.type}/${event.resource.id}`;
  const ip = event.actor.ip ? ` from ${event.actor.ip}` : "";
  return `[${event.timestamp}] [${event.severity.toUpperCase()}] ${actor}${ip} performed ${event.action} on ${resource} → ${event.outcome}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// formatAuditEventJson
// ─────────────────────────────────────────────────────────────────────────────

export function formatAuditEventJson(event: AuditEvent): string {
  return JSON.stringify(event, null, 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// formatAuditEventCef  (ArcSight CEF)
// ─────────────────────────────────────────────────────────────────────────────

const CEF_SEVERITY: Record<AuditSeverity, number> = {
  low: 3,
  medium: 5,
  high: 8,
  critical: 10,
};

/**
 * Format as ArcSight Common Event Format (CEF).
 * CEF:Version|Device Vendor|Device Product|Device Version|SignatureID|Name|Severity|Extension
 */
export function formatAuditEventCef(event: AuditEvent): string {
  const sev = CEF_SEVERITY[event.severity];
  const ext: string[] = [
    `rt=${new Date(event.timestamp).getTime()}`,
    `suser=${escapeCef(event.actor.email ?? event.actor.id)}`,
    `suid=${escapeCef(event.actor.id)}`,
    `src=${escapeCef(event.actor.ip ?? "")}`,
    `dvchost=${escapeCef(event.resource.type)}`,
    `fileId=${escapeCef(event.resource.id)}`,
    `outcome=${escapeCef(event.outcome)}`,
    `requestId=${escapeCef(event.requestId ?? "")}`,
  ].filter((kv) => !kv.endsWith("="));

  return `CEF:0|PowerNode|AuditLog|1.0|${escapeCef(event.action)}|${escapeCef(event.action)}|${sev}|${ext.join(" ")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// formatAuditEventLeef  (IBM QRadar LEEF)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format as IBM QRadar Log Event Extended Format (LEEF).
 * LEEF:Version|Vendor|Product|Version|EventID|key=value...
 */
export function formatAuditEventLeef(event: AuditEvent): string {
  const attrs: string[] = [
    `devTime=${event.timestamp}`,
    `usrName=${event.actor.email ?? event.actor.id}`,
    `src=${event.actor.ip ?? ""}`,
    `action=${event.action}`,
    `resource=${event.resource.type}/${event.resource.id}`,
    `outcome=${event.outcome}`,
    `severity=${event.severity}`,
  ];
  return `LEEF:2.0|PowerNode|AuditLog|1.0|${event.action}|${attrs.join("\t")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// maskSensitiveFields
// ─────────────────────────────────────────────────────────────────────────────

const SENSITIVE_KEYS = new Set(["password", "token", "secret", "apiKey", "api_key", "accessKey", "privateKey"]);

/**
 * Mask password/token/secret fields in metadata with "***".
 */
export function maskSensitiveFields(event: AuditEvent): AuditEvent {
  if (!event.metadata) return event;
  const maskedMeta = maskObjectKeys(event.metadata, SENSITIVE_KEYS);
  return { ...event, metadata: maskedMeta };
}

// ─────────────────────────────────────────────────────────────────────────────
// redactPii
// ─────────────────────────────────────────────────────────────────────────────

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

/**
 * Redact PII (email addresses and IP addresses) from the event.
 */
export function redactPii(event: AuditEvent): AuditEvent {
  const redactedActor: AuditActor = {
    ...event.actor,
    email: event.actor.email ? "[REDACTED_EMAIL]" : undefined,
    ip: event.actor.ip ? "[REDACTED_IP]" : undefined,
  };

  const redactedMeta = event.metadata
    ? redactStringsInObject(event.metadata, [EMAIL_RE, IPV4_RE])
    : undefined;

  return { ...event, actor: redactedActor, metadata: redactedMeta };
}

// ─────────────────────────────────────────────────────────────────────────────
// filterAuditEvents
// ─────────────────────────────────────────────────────────────────────────────

export function filterAuditEvents(
  events: AuditEvent[],
  filters: AuditFilter
): AuditEvent[] {
  return events.filter((e) => {
    if (filters.fromDate && e.timestamp < filters.fromDate) return false;
    if (filters.toDate && e.timestamp > filters.toDate) return false;
    if (filters.userId && e.actor.id !== filters.userId) return false;
    if (filters.action && !e.action.includes(filters.action)) return false;
    if (filters.resourceType && e.resource.type !== filters.resourceType) return false;
    if (filters.outcome && e.outcome !== filters.outcome) return false;
    if (filters.severity && e.severity !== filters.severity) return false;
    if (filters.ip && e.actor.ip !== filters.ip) return false;
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// groupAuditEvents
// ─────────────────────────────────────────────────────────────────────────────

export function groupAuditEvents(
  events: AuditEvent[],
  groupBy: GroupByField
): Record<string, AuditEvent[]> {
  const result: Record<string, AuditEvent[]> = {};
  for (const e of events) {
    const key = getGroupKey(e, groupBy);
    if (!result[key]) result[key] = [];
    result[key].push(e);
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// computeAuditStats
// ─────────────────────────────────────────────────────────────────────────────

export function computeAuditStats(
  events: AuditEvent[],
  period: { from: string; to: string }
): AuditStats {
  const byOutcome: Record<AuditOutcome, number> = { success: 0, failure: 0, unknown: 0 };
  const bySeverity: Record<AuditSeverity, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  const byAction: Record<string, number> = {};
  const byActor: Record<string, number> = {};

  for (const e of events) {
    byOutcome[e.outcome] = (byOutcome[e.outcome] ?? 0) + 1;
    bySeverity[e.severity] = (bySeverity[e.severity] ?? 0) + 1;
    byAction[e.action] = (byAction[e.action] ?? 0) + 1;
    byActor[e.actor.id] = (byActor[e.actor.id] ?? 0) + 1;
  }

  const successRate = events.length > 0
    ? byOutcome.success / events.length
    : 0;

  return {
    total: events.length,
    byOutcome,
    bySeverity,
    byAction,
    byActor,
    successRate,
    period,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// detectAnomalies
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_THRESHOLDS: Required<AnomalyThresholds> = {
  failedLoginsPerMinute: 5,
  actionsPerMinute: 60,
  uniqueIpsPerHour: 10,
};

/**
 * Detect suspicious patterns: brute-force login attempts, action flood, IP scatter.
 */
export function detectAnomalies(
  events: AuditEvent[],
  thresholds?: AnomalyThresholds
): AnomalyResult[] {
  const th = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const anomalies: AnomalyResult[] = [];

  // 1. Brute-force: failed logins per actor per minute
  const failedLogins = events.filter(
    (e) => e.action.includes("login") && e.outcome === "failure"
  );
  const loginByActor = groupByKey(failedLogins, (e) => e.actor.id);
  for (const [actorId, actorEvents] of Object.entries(loginByActor)) {
    const byMinute = groupByKey(actorEvents, (e) =>
      e.timestamp.slice(0, 16) // YYYY-MM-DDTHH:MM
    );
    for (const [minute, minuteEvents] of Object.entries(byMinute)) {
      if (minuteEvents.length >= th.failedLoginsPerMinute) {
        anomalies.push({
          type: "brute_force",
          description: `Actor ${actorId} had ${minuteEvents.length} failed logins in minute ${minute}`,
          events: minuteEvents,
          severity: "high",
        });
      }
    }
  }

  // 2. Action flood: many actions per actor per minute
  const byActorMinute = groupByKey(events, (e) => `${e.actor.id}|${e.timestamp.slice(0, 16)}`);
  for (const [key, keyEvents] of Object.entries(byActorMinute)) {
    if (keyEvents.length >= th.actionsPerMinute) {
      anomalies.push({
        type: "action_flood",
        description: `Key ${key} performed ${keyEvents.length} actions in one minute`,
        events: keyEvents,
        severity: "medium",
      });
    }
  }

  // 3. IP scatter: actor using many unique IPs in an hour
  const byActorHour = groupByKey(events, (e) => `${e.actor.id}|${e.timestamp.slice(0, 13)}`);
  for (const [key, keyEvents] of Object.entries(byActorHour)) {
    const uniqueIps = new Set(keyEvents.map((e) => e.actor.ip).filter(Boolean));
    if (uniqueIps.size >= th.uniqueIpsPerHour) {
      anomalies.push({
        type: "ip_scatter",
        description: `Key ${key} used ${uniqueIps.size} unique IPs in one hour`,
        events: keyEvents,
        severity: "medium",
      });
    }
  }

  return anomalies;
}

// ─────────────────────────────────────────────────────────────────────────────
// generateAuditReport
// ─────────────────────────────────────────────────────────────────────────────

export function generateAuditReport(
  events: AuditEvent[],
  config: { title?: string; period: { from: string; to: string } }
): AuditReport {
  const stats = computeAuditStats(events, config.period);
  const anomalies = detectAnomalies(events);

  const topActions = Object.entries(stats.byAction)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([action, count]) => ({ action, count }));

  const topActors = Object.entries(stats.byActor)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([actorId, count]) => ({ actorId, count }));

  return {
    generatedAt: new Date().toISOString(),
    title: config.title ?? "Audit Log Report",
    summary: `${stats.total} events between ${config.period.from} and ${config.period.to}. Success rate: ${(stats.successRate * 100).toFixed(1)}%.`,
    stats,
    anomalies,
    topActions,
    topActors,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// exportAuditLog
// ─────────────────────────────────────────────────────────────────────────────

export function exportAuditLog(events: AuditEvent[], format: ExportFormat): string {
  switch (format) {
    case "json":
      return JSON.stringify(events, null, 2);
    case "cef":
      return events.map(formatAuditEventCef).join("\n");
    case "csv":
      return exportCsv(events);
    default:
      return JSON.stringify(events, null, 2);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

let _idCounter = 0;
function generateId(): string {
  _idCounter += 1;
  return `audit-${Date.now()}-${_idCounter}`;
}

function escapeCef(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/=/g, "\\=");
}

function maskObjectKeys(
  obj: Record<string, unknown>,
  sensitiveKeys: Set<string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (sensitiveKeys.has(k)) {
      result[k] = "***";
    } else if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      result[k] = maskObjectKeys(v as Record<string, unknown>, sensitiveKeys);
    } else {
      result[k] = v;
    }
  }
  return result;
}

function redactStringsInObject(
  obj: Record<string, unknown>,
  patterns: RegExp[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") {
      let redacted = v;
      for (const re of patterns) {
        redacted = redacted.replace(re, "[REDACTED]");
      }
      result[k] = redacted;
    } else if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      result[k] = redactStringsInObject(v as Record<string, unknown>, patterns);
    } else {
      result[k] = v;
    }
  }
  return result;
}

function getGroupKey(event: AuditEvent, groupBy: GroupByField): string {
  switch (groupBy) {
    case "action": return event.action;
    case "actor.id": return event.actor.id;
    case "resource.type": return event.resource.type;
    case "severity": return event.severity;
    case "outcome": return event.outcome;
    case "date": return event.timestamp.slice(0, 10);
    default: return "unknown";
  }
}

function groupByKey<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!result[key]) result[key] = [];
    result[key].push(item);
  }
  return result;
}

function exportCsv(events: AuditEvent[]): string {
  const header = "id,timestamp,action,actor_id,actor_email,actor_ip,resource_type,resource_id,outcome,severity";
  const rows = events.map((e) =>
    [
      csvCell(e.id),
      csvCell(e.timestamp),
      csvCell(e.action),
      csvCell(e.actor.id),
      csvCell(e.actor.email ?? ""),
      csvCell(e.actor.ip ?? ""),
      csvCell(e.resource.type),
      csvCell(e.resource.id),
      csvCell(e.outcome),
      csvCell(e.severity),
    ].join(",")
  );
  return [header, ...rows].join("\n");
}

function csvCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
