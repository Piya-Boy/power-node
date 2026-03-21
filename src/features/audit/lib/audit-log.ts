/**
 * Phase 25 — Audit Log
 * Pure utilities for recording and querying audit events.
 */

export type AuditAction =
  // Workflow
  | "workflow.create"
  | "workflow.update"
  | "workflow.delete"
  | "workflow.execute"
  | "workflow.import"
  | "workflow.export"
  | "workflow.duplicate"
  | "workflow.activate"
  | "workflow.deactivate"
  // Credentials
  | "credential.create"
  | "credential.update"
  | "credential.delete"
  // API Keys
  | "apikey.create"
  | "apikey.delete"
  // Projects
  | "project.create"
  | "project.update"
  | "project.delete"
  | "project.member.add"
  | "project.member.remove"
  | "project.member.role_change"
  // Auth
  | "auth.login"
  | "auth.logout"
  | "auth.login_failed";

export type AuditSeverity = "info" | "warning" | "critical";

export interface AuditEntry {
  id: string;
  action: AuditAction;
  severity: AuditSeverity;
  userId: string;
  userEmail?: string;
  resourceType: string;
  resourceId?: string;
  resourceName?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  success: boolean;
  errorMessage?: string;
}

export interface AuditFilter {
  userId?: string;
  action?: AuditAction;
  resourceType?: string;
  resourceId?: string;
  severity?: AuditSeverity;
  success?: boolean;
  from?: Date;
  to?: Date;
}

const SEVERITY_MAP: Record<AuditAction, AuditSeverity> = {
  "workflow.create": "info",
  "workflow.update": "info",
  "workflow.delete": "warning",
  "workflow.execute": "info",
  "workflow.import": "info",
  "workflow.export": "info",
  "workflow.duplicate": "info",
  "workflow.activate": "info",
  "workflow.deactivate": "info",
  "credential.create": "info",
  "credential.update": "warning",
  "credential.delete": "warning",
  "apikey.create": "info",
  "apikey.delete": "warning",
  "project.create": "info",
  "project.update": "info",
  "project.delete": "warning",
  "project.member.add": "info",
  "project.member.remove": "warning",
  "project.member.role_change": "warning",
  "auth.login": "info",
  "auth.logout": "info",
  "auth.login_failed": "critical",
};

let _idCounter = 0;
function generateId(): string {
  return `audit-${Date.now()}-${++_idCounter}`;
}

/**
 * Create an audit log entry.
 */
export function createAuditEntry(params: {
  action: AuditAction;
  userId: string;
  userEmail?: string;
  resourceType: string;
  resourceId?: string;
  resourceName?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  success?: boolean;
  errorMessage?: string;
}): AuditEntry {
  return {
    id: generateId(),
    action: params.action,
    severity: SEVERITY_MAP[params.action] ?? "info",
    userId: params.userId,
    userEmail: params.userEmail,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    resourceName: params.resourceName,
    metadata: params.metadata,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    timestamp: new Date(),
    success: params.success ?? true,
    errorMessage: params.errorMessage,
  };
}

/**
 * Filter audit entries by various criteria.
 */
export function filterAuditLog(
  entries: AuditEntry[],
  filter: AuditFilter
): AuditEntry[] {
  return entries.filter((e) => {
    if (filter.userId && e.userId !== filter.userId) return false;
    if (filter.action && e.action !== filter.action) return false;
    if (filter.resourceType && e.resourceType !== filter.resourceType) return false;
    if (filter.resourceId && e.resourceId !== filter.resourceId) return false;
    if (filter.severity && e.severity !== filter.severity) return false;
    if (filter.success !== undefined && e.success !== filter.success) return false;
    if (filter.from && e.timestamp < filter.from) return false;
    if (filter.to && e.timestamp > filter.to) return false;
    return true;
  });
}

/**
 * Sort audit entries by timestamp (newest first by default).
 */
export function sortAuditLog(
  entries: AuditEntry[],
  order: "asc" | "desc" = "desc"
): AuditEntry[] {
  return [...entries].sort((a, b) => {
    const diff = a.timestamp.getTime() - b.timestamp.getTime();
    return order === "desc" ? -diff : diff;
  });
}

/**
 * Get audit stats for a set of entries.
 */
export function getAuditStats(entries: AuditEntry[]): {
  total: number;
  successCount: number;
  failureCount: number;
  criticalCount: number;
  byAction: Record<string, number>;
  byUser: Record<string, number>;
} {
  const byAction: Record<string, number> = {};
  const byUser: Record<string, number> = {};
  let successCount = 0;
  let failureCount = 0;
  let criticalCount = 0;

  for (const e of entries) {
    byAction[e.action] = (byAction[e.action] ?? 0) + 1;
    byUser[e.userId] = (byUser[e.userId] ?? 0) + 1;
    if (e.success) successCount++;
    else failureCount++;
    if (e.severity === "critical") criticalCount++;
  }

  return {
    total: entries.length,
    successCount,
    failureCount,
    criticalCount,
    byAction,
    byUser,
  };
}

/**
 * Format an audit entry to a human-readable string.
 */
export function formatAuditEntry(entry: AuditEntry): string {
  const time = entry.timestamp.toISOString();
  const status = entry.success ? "✓" : "✗";
  const resource = entry.resourceName
    ? `${entry.resourceType}(${entry.resourceName})`
    : entry.resourceType;
  return `[${time}] ${status} ${entry.action} on ${resource} by ${entry.userEmail ?? entry.userId}`;
}

/**
 * Get recent failed entries for security monitoring.
 */
export function getRecentFailures(
  entries: AuditEntry[],
  limit = 10
): AuditEntry[] {
  return sortAuditLog(entries.filter((e) => !e.success), "desc").slice(0, limit);
}

/**
 * Check if there are suspicious auth failure patterns (brute force detection).
 * Returns true if userId had more than `threshold` failures in the last `windowMs`.
 */
export function detectBruteForce(
  entries: AuditEntry[],
  userId: string,
  threshold = 5,
  windowMs = 15 * 60 * 1000 // 15 minutes
): boolean {
  const cutoff = new Date(Date.now() - windowMs);
  const failures = entries.filter(
    (e) =>
      e.userId === userId &&
      e.action === "auth.login_failed" &&
      e.timestamp >= cutoff
  );
  return failures.length >= threshold;
}
