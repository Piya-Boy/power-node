/**
 * Phase 59 — Workflow Run Analytics & Alerting
 * Pure utilities for tracking run metrics, detecting anomalies,
 * and generating alert rules and notifications.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type RunStatus = "success" | "failed" | "timeout" | "cancelled" | "skipped";

export type AlertSeverity = "info" | "warning" | "critical";

export type AlertCondition =
  | "failure_rate_above"    // % of runs that fail
  | "error_spike"           // sudden increase in errors
  | "slow_run"              // run duration exceeds threshold
  | "no_runs"               // no executions in expected window
  | "consecutive_failures"  // N failures in a row
  | "run_count_anomaly";    // run count deviates from baseline

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: RunStatus;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  errorMessage?: string;
  nodeCount: number;
}

export interface AlertRule {
  id: string;
  workflowId: string;
  name: string;
  condition: AlertCondition;
  threshold: number;          // meaning depends on condition (%, count, ms)
  windowMinutes: number;      // evaluation window
  severity: AlertSeverity;
  enabled: boolean;
  cooldownMinutes?: number;   // min time between alerts
  notifyChannels: string[];   // e.g. ["email", "slack"]
  lastTriggeredAt?: Date;
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  workflowId: string;
  condition: AlertCondition;
  severity: AlertSeverity;
  message: string;
  triggeredAt: Date;
  value: number;             // the metric value that triggered it
  threshold: number;
  resolved: boolean;
  resolvedAt?: Date;
}

export interface RunWindow {
  workflowId: string;
  from: Date;
  to: Date;
  runs: WorkflowRun[];
}

export interface RunMetrics {
  workflowId: string;
  total: number;
  success: number;
  failed: number;
  timeout: number;
  cancelled: number;
  skipped: number;
  successRate: number;        // 0-100
  failureRate: number;        // 0-100
  avgDurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  maxDurationMs: number;
  minDurationMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Metrics Computation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute run metrics for a set of runs.
 */
export function computeRunMetrics(workflowId: string, runs: WorkflowRun[]): RunMetrics {
  const empty: RunMetrics = {
    workflowId,
    total: 0, success: 0, failed: 0, timeout: 0, cancelled: 0, skipped: 0,
    successRate: 0, failureRate: 0,
    avgDurationMs: 0, p95DurationMs: 0, p99DurationMs: 0, maxDurationMs: 0, minDurationMs: 0,
  };
  if (runs.length === 0) return empty;

  let success = 0, failed = 0, timeout = 0, cancelled = 0, skipped = 0;
  const durations: number[] = [];

  for (const r of runs) {
    durations.push(r.durationMs);
    if (r.status === "success") success++;
    else if (r.status === "failed") failed++;
    else if (r.status === "timeout") timeout++;
    else if (r.status === "cancelled") cancelled++;
    else if (r.status === "skipped") skipped++;
  }

  durations.sort((a, b) => a - b);
  const total = runs.length;
  const avgDurationMs = durations.reduce((s, d) => s + d, 0) / total;

  return {
    workflowId,
    total,
    success,
    failed,
    timeout,
    cancelled,
    skipped,
    successRate: (success / total) * 100,
    failureRate: ((failed + timeout) / total) * 100,
    avgDurationMs,
    p95DurationMs: percentile(durations, 95),
    p99DurationMs: percentile(durations, 99),
    maxDurationMs: durations[durations.length - 1],
    minDurationMs: durations[0],
  };
}

/**
 * Filter runs to a time window.
 */
export function filterRunsToWindow(runs: WorkflowRun[], from: Date, to: Date): WorkflowRun[] {
  return runs.filter((r) => r.startedAt >= from && r.startedAt <= to);
}

/**
 * Get consecutive failures at the end of a run list (sorted by startedAt).
 */
export function getConsecutiveFailuresAtEnd(runs: WorkflowRun[]): number {
  const sorted = [...runs].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  let count = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].status === "failed" || sorted[i].status === "timeout") count++;
    else break;
  }
  return count;
}

// ─────────────────────────────────────────────────────────────────────────────
// Alert Rules
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create an alert rule.
 */
export function createAlertRule(params: {
  id: string;
  workflowId: string;
  name: string;
  condition: AlertCondition;
  threshold: number;
  windowMinutes?: number;
  severity?: AlertSeverity;
  notifyChannels?: string[];
  cooldownMinutes?: number;
}): AlertRule {
  return {
    id: params.id,
    workflowId: params.workflowId,
    name: params.name,
    condition: params.condition,
    threshold: params.threshold,
    windowMinutes: params.windowMinutes ?? 60,
    severity: params.severity ?? "warning",
    enabled: true,
    cooldownMinutes: params.cooldownMinutes,
    notifyChannels: params.notifyChannels ?? [],
  };
}

/**
 * Validate an alert rule configuration.
 */
export function validateAlertRule(rule: Partial<AlertRule>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!rule.name || rule.name.trim() === "") errors.push("name is required");
  if (!rule.condition) errors.push("condition is required");
  if (rule.threshold === undefined || rule.threshold < 0) errors.push("threshold must be >= 0");
  if (rule.windowMinutes !== undefined && rule.windowMinutes < 1) errors.push("windowMinutes must be >= 1");
  if (rule.condition === "failure_rate_above" && rule.threshold !== undefined && rule.threshold > 100) {
    errors.push("failure_rate_above threshold must be <= 100");
  }
  return { valid: errors.length === 0, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Alert Evaluation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate a single alert rule against a run window.
 * Returns an AlertEvent if the rule fires, null otherwise.
 */
export function evaluateAlertRule(
  rule: AlertRule,
  runs: WorkflowRun[],
  now?: Date
): AlertEvent | null {
  if (!rule.enabled) return null;
  const ts = now ?? new Date();

  // Check cooldown
  if (rule.lastTriggeredAt && rule.cooldownMinutes) {
    const cooldownMs = rule.cooldownMinutes * 60 * 1000;
    if (ts.getTime() - rule.lastTriggeredAt.getTime() < cooldownMs) return null;
  }

  const windowFrom = new Date(ts.getTime() - rule.windowMinutes * 60 * 1000);
  const windowRuns = filterRunsToWindow(runs, windowFrom, ts);

  let value = 0;
  let fires = false;
  let message = "";

  switch (rule.condition) {
    case "failure_rate_above": {
      if (windowRuns.length === 0) return null;
      const metrics = computeRunMetrics(rule.workflowId, windowRuns);
      value = metrics.failureRate;
      fires = value > rule.threshold;
      message = `Failure rate ${value.toFixed(1)}% exceeds threshold ${rule.threshold}%`;
      break;
    }
    case "consecutive_failures": {
      value = getConsecutiveFailuresAtEnd(windowRuns);
      fires = value >= rule.threshold;
      message = `${value} consecutive failures (threshold: ${rule.threshold})`;
      break;
    }
    case "slow_run": {
      const slowRuns = windowRuns.filter((r) => r.durationMs > rule.threshold);
      value = slowRuns.length;
      fires = value > 0;
      message = `${value} run(s) exceeded ${rule.threshold}ms duration threshold`;
      break;
    }
    case "no_runs": {
      value = windowRuns.length;
      fires = value === 0;
      message = `No executions in the last ${rule.windowMinutes} minutes`;
      break;
    }
    case "error_spike": {
      const halfWindow = rule.windowMinutes / 2;
      const halfMs = halfWindow * 60 * 1000;
      const recentRuns = filterRunsToWindow(runs, new Date(ts.getTime() - halfMs), ts);
      const olderRuns = filterRunsToWindow(runs, windowFrom, new Date(ts.getTime() - halfMs));
      const recentFailed = recentRuns.filter((r) => r.status === "failed" || r.status === "timeout").length;
      const olderFailed = olderRuns.filter((r) => r.status === "failed" || r.status === "timeout").length;
      value = recentFailed;
      fires = olderFailed === 0 ? recentFailed >= rule.threshold : recentFailed >= olderFailed * rule.threshold;
      message = `Error spike detected: ${recentFailed} failures in last ${halfWindow} minutes`;
      break;
    }
    case "run_count_anomaly": {
      // threshold = expected run count; fires if actual deviates by > 50%
      value = windowRuns.length;
      const deviation = Math.abs(value - rule.threshold) / Math.max(rule.threshold, 1);
      fires = deviation > 0.5;
      message = `Run count anomaly: expected ~${rule.threshold}, got ${value}`;
      break;
    }
  }

  if (!fires) return null;

  return {
    id: `alert_${rule.id}_${ts.getTime()}`,
    ruleId: rule.id,
    workflowId: rule.workflowId,
    condition: rule.condition,
    severity: rule.severity,
    message,
    triggeredAt: ts,
    value,
    threshold: rule.threshold,
    resolved: false,
  };
}

/**
 * Evaluate all rules for a workflow and return fired alerts.
 */
export function evaluateAllRules(
  rules: AlertRule[],
  runs: WorkflowRun[],
  now?: Date
): AlertEvent[] {
  const alerts: AlertEvent[] = [];
  for (const rule of rules) {
    const event = evaluateAlertRule(rule, runs, now);
    if (event) alerts.push(event);
  }
  return alerts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Alert Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mark an alert as resolved.
 */
export function resolveAlert(alert: AlertEvent, now?: Date): AlertEvent {
  return { ...alert, resolved: true, resolvedAt: now ?? new Date() };
}

/**
 * Get unresolved alerts, sorted by severity (critical first).
 */
export function getUnresolvedAlerts(alerts: AlertEvent[]): AlertEvent[] {
  const order: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return alerts
    .filter((a) => !a.resolved)
    .sort((a, b) => order[a.severity] - order[b.severity]);
}

/**
 * Get alert history for a specific workflow.
 */
export function getWorkflowAlerts(alerts: AlertEvent[], workflowId: string): AlertEvent[] {
  return alerts.filter((a) => a.workflowId === workflowId);
}

/**
 * Summarize alerts: count by severity and condition.
 */
export function summarizeAlerts(alerts: AlertEvent[]): {
  total: number;
  unresolved: number;
  bySeverity: Record<AlertSeverity, number>;
  byCondition: Partial<Record<AlertCondition, number>>;
} {
  const bySeverity: Record<AlertSeverity, number> = { info: 0, warning: 0, critical: 0 };
  const byCondition: Partial<Record<AlertCondition, number>> = {};

  for (const a of alerts) {
    bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1;
    byCondition[a.condition] = (byCondition[a.condition] ?? 0) + 1;
  }

  return {
    total: alerts.length,
    unresolved: alerts.filter((a) => !a.resolved).length,
    bySeverity,
    byCondition,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Run Grouping & Trending
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Group runs by hour bucket.
 */
export function groupRunsByHour(runs: WorkflowRun[]): Map<string, WorkflowRun[]> {
  const map = new Map<string, WorkflowRun[]>();
  for (const run of runs) {
    const key = run.startedAt.toISOString().slice(0, 13); // "2025-06-01T14"
    const bucket = map.get(key) ?? [];
    bucket.push(run);
    map.set(key, bucket);
  }
  return map;
}

/**
 * Compute a rolling failure rate over a list of runs (sorted ascending by startedAt),
 * using a sliding window of N runs.
 */
export function rollingFailureRate(runs: WorkflowRun[], windowSize: number): number[] {
  if (runs.length === 0 || windowSize < 1) return [];
  const sorted = [...runs].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const rates: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const window = sorted.slice(start, i + 1);
    const failed = window.filter((r) => r.status === "failed" || r.status === "timeout").length;
    rates.push((failed / window.length) * 100);
  }
  return rates;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}
