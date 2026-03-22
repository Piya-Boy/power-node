import { describe, it, expect } from "vitest";
import {
  computeRunMetrics,
  filterRunsToWindow,
  getConsecutiveFailuresAtEnd,
  createAlertRule,
  validateAlertRule,
  evaluateAlertRule,
  evaluateAllRules,
  resolveAlert,
  getUnresolvedAlerts,
  getWorkflowAlerts,
  summarizeAlerts,
  groupRunsByHour,
  rollingFailureRate,
  type WorkflowRun,
  type AlertRule,
  type AlertEvent,
} from "./run-alerting";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: "run1",
    workflowId: "wf1",
    status: "success",
    startedAt: new Date("2025-06-01T10:00:00Z"),
    finishedAt: new Date("2025-06-01T10:00:01Z"),
    durationMs: 1000,
    nodeCount: 3,
    ...overrides,
  };
}

function makeRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return createAlertRule({
    id: "rule1",
    workflowId: "wf1",
    name: "Test Rule",
    condition: "failure_rate_above",
    threshold: 50,
    windowMinutes: 60,
    ...overrides,
  });
}

function makeAlert(overrides: Partial<AlertEvent> = {}): AlertEvent {
  return {
    id: "alert1",
    ruleId: "rule1",
    workflowId: "wf1",
    condition: "failure_rate_above",
    severity: "warning",
    message: "Failure rate exceeded",
    triggeredAt: new Date("2025-06-01T10:00:00Z"),
    value: 60,
    threshold: 50,
    resolved: false,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// computeRunMetrics
// ─────────────────────────────────────────────────────────────────────────────

describe("computeRunMetrics", () => {
  it("returns zeroed metrics for empty runs", () => {
    const m = computeRunMetrics("wf1", []);
    expect(m.total).toBe(0);
    expect(m.successRate).toBe(0);
    expect(m.avgDurationMs).toBe(0);
  });

  it("computes success rate correctly", () => {
    const runs = [
      makeRun({ id: "r1", status: "success" }),
      makeRun({ id: "r2", status: "success" }),
      makeRun({ id: "r3", status: "failed" }),
      makeRun({ id: "r4", status: "failed" }),
    ];
    const m = computeRunMetrics("wf1", runs);
    expect(m.successRate).toBe(50);
    expect(m.failureRate).toBe(50);
  });

  it("includes timeout in failure rate", () => {
    const runs = [
      makeRun({ id: "r1", status: "success" }),
      makeRun({ id: "r2", status: "timeout" }),
    ];
    const m = computeRunMetrics("wf1", runs);
    expect(m.failureRate).toBe(50);
    expect(m.timeout).toBe(1);
  });

  it("computes average duration", () => {
    const runs = [
      makeRun({ id: "r1", durationMs: 1000 }),
      makeRun({ id: "r2", durationMs: 3000 }),
    ];
    const m = computeRunMetrics("wf1", runs);
    expect(m.avgDurationMs).toBe(2000);
  });

  it("computes p95 duration", () => {
    const runs = Array.from({ length: 100 }, (_, i) =>
      makeRun({ id: `r${i}`, durationMs: (i + 1) * 100 })
    );
    const m = computeRunMetrics("wf1", runs);
    expect(m.p95DurationMs).toBe(9500);
  });

  it("computes min and max duration", () => {
    const runs = [
      makeRun({ id: "r1", durationMs: 500 }),
      makeRun({ id: "r2", durationMs: 2000 }),
      makeRun({ id: "r3", durationMs: 1000 }),
    ];
    const m = computeRunMetrics("wf1", runs);
    expect(m.minDurationMs).toBe(500);
    expect(m.maxDurationMs).toBe(2000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// filterRunsToWindow
// ─────────────────────────────────────────────────────────────────────────────

describe("filterRunsToWindow", () => {
  const runs = [
    makeRun({ id: "r1", startedAt: new Date("2025-06-01T09:00:00Z") }),
    makeRun({ id: "r2", startedAt: new Date("2025-06-01T10:00:00Z") }),
    makeRun({ id: "r3", startedAt: new Date("2025-06-01T11:00:00Z") }),
  ];

  it("includes runs within window", () => {
    const filtered = filterRunsToWindow(
      runs,
      new Date("2025-06-01T09:30:00Z"),
      new Date("2025-06-01T10:30:00Z")
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("r2");
  });

  it("is inclusive of boundaries", () => {
    const filtered = filterRunsToWindow(
      runs,
      new Date("2025-06-01T09:00:00Z"),
      new Date("2025-06-01T10:00:00Z")
    );
    expect(filtered).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getConsecutiveFailuresAtEnd
// ─────────────────────────────────────────────────────────────────────────────

describe("getConsecutiveFailuresAtEnd", () => {
  it("returns 0 when last run succeeded", () => {
    const runs = [
      makeRun({ id: "r1", startedAt: new Date("2025-06-01T10:00:00Z"), status: "failed" }),
      makeRun({ id: "r2", startedAt: new Date("2025-06-01T10:01:00Z"), status: "success" }),
    ];
    expect(getConsecutiveFailuresAtEnd(runs)).toBe(0);
  });

  it("counts consecutive failures at the end", () => {
    const runs = [
      makeRun({ id: "r1", startedAt: new Date("2025-06-01T10:00:00Z"), status: "success" }),
      makeRun({ id: "r2", startedAt: new Date("2025-06-01T10:01:00Z"), status: "failed" }),
      makeRun({ id: "r3", startedAt: new Date("2025-06-01T10:02:00Z"), status: "failed" }),
      makeRun({ id: "r4", startedAt: new Date("2025-06-01T10:03:00Z"), status: "timeout" }),
    ];
    expect(getConsecutiveFailuresAtEnd(runs)).toBe(3);
  });

  it("returns 0 for empty list", () => {
    expect(getConsecutiveFailuresAtEnd([])).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createAlertRule / validateAlertRule
// ─────────────────────────────────────────────────────────────────────────────

describe("createAlertRule", () => {
  it("creates enabled rule with defaults", () => {
    const rule = createAlertRule({
      id: "r1", workflowId: "wf1", name: "Test", condition: "failure_rate_above", threshold: 50,
    });
    expect(rule.enabled).toBe(true);
    expect(rule.severity).toBe("warning");
    expect(rule.windowMinutes).toBe(60);
    expect(rule.notifyChannels).toEqual([]);
  });
});

describe("validateAlertRule", () => {
  it("accepts valid rule", () => {
    const result = validateAlertRule({ name: "Test", condition: "failure_rate_above", threshold: 50, windowMinutes: 30 });
    expect(result.valid).toBe(true);
  });

  it("errors on missing name", () => {
    const result = validateAlertRule({ condition: "failure_rate_above", threshold: 50 });
    expect(result.errors).toContain("name is required");
  });

  it("errors on negative threshold", () => {
    const result = validateAlertRule({ name: "T", condition: "failure_rate_above", threshold: -1 });
    expect(result.errors).toContain("threshold must be >= 0");
  });

  it("errors on windowMinutes < 1", () => {
    const result = validateAlertRule({ name: "T", condition: "failure_rate_above", threshold: 50, windowMinutes: 0 });
    expect(result.errors).toContain("windowMinutes must be >= 1");
  });

  it("errors when failure_rate threshold > 100", () => {
    const result = validateAlertRule({ name: "T", condition: "failure_rate_above", threshold: 150 });
    expect(result.errors).toContain("failure_rate_above threshold must be <= 100");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluateAlertRule
// ─────────────────────────────────────────────────────────────────────────────

describe("evaluateAlertRule — failure_rate_above", () => {
  const now = new Date("2025-06-01T11:00:00Z");

  it("fires when failure rate exceeds threshold", () => {
    const runs = [
      makeRun({ id: "r1", startedAt: new Date("2025-06-01T10:30:00Z"), status: "failed" }),
      makeRun({ id: "r2", startedAt: new Date("2025-06-01T10:31:00Z"), status: "failed" }),
      makeRun({ id: "r3", startedAt: new Date("2025-06-01T10:32:00Z"), status: "success" }),
    ];
    const rule = makeRule({ condition: "failure_rate_above", threshold: 50 });
    const alert = evaluateAlertRule(rule, runs, now);
    expect(alert).not.toBeNull();
    expect(alert?.condition).toBe("failure_rate_above");
    expect(alert?.value).toBeGreaterThan(50);
  });

  it("does not fire when failure rate is below threshold", () => {
    const runs = [
      makeRun({ id: "r1", startedAt: new Date("2025-06-01T10:30:00Z"), status: "success" }),
      makeRun({ id: "r2", startedAt: new Date("2025-06-01T10:31:00Z"), status: "success" }),
    ];
    const rule = makeRule({ condition: "failure_rate_above", threshold: 50 });
    expect(evaluateAlertRule(rule, runs, now)).toBeNull();
  });

  it("returns null when no runs in window", () => {
    const rule = makeRule({ condition: "failure_rate_above", threshold: 50 });
    expect(evaluateAlertRule(rule, [], now)).toBeNull();
  });

  it("does not fire when rule is disabled", () => {
    const runs = [makeRun({ id: "r1", startedAt: new Date("2025-06-01T10:30:00Z"), status: "failed" })];
    const rule = { ...makeRule(), enabled: false };
    expect(evaluateAlertRule(rule, runs, now)).toBeNull();
  });
});

describe("evaluateAlertRule — consecutive_failures", () => {
  const now = new Date("2025-06-01T11:00:00Z");

  it("fires when consecutive failures meet threshold", () => {
    const runs = [
      makeRun({ id: "r1", startedAt: new Date("2025-06-01T10:30:00Z"), status: "failed" }),
      makeRun({ id: "r2", startedAt: new Date("2025-06-01T10:31:00Z"), status: "failed" }),
      makeRun({ id: "r3", startedAt: new Date("2025-06-01T10:32:00Z"), status: "failed" }),
    ];
    const rule = makeRule({ condition: "consecutive_failures", threshold: 3 });
    const alert = evaluateAlertRule(rule, runs, now);
    expect(alert).not.toBeNull();
    expect(alert?.value).toBe(3);
  });

  it("does not fire below threshold", () => {
    const runs = [
      makeRun({ id: "r1", startedAt: new Date("2025-06-01T10:30:00Z"), status: "failed" }),
      makeRun({ id: "r2", startedAt: new Date("2025-06-01T10:31:00Z"), status: "failed" }),
    ];
    const rule = makeRule({ condition: "consecutive_failures", threshold: 3 });
    expect(evaluateAlertRule(rule, runs, now)).toBeNull();
  });
});

describe("evaluateAlertRule — slow_run", () => {
  const now = new Date("2025-06-01T11:00:00Z");

  it("fires when a run exceeds duration threshold", () => {
    const runs = [
      makeRun({ id: "r1", startedAt: new Date("2025-06-01T10:30:00Z"), durationMs: 60_000 }),
    ];
    const rule = makeRule({ condition: "slow_run", threshold: 30_000 });
    const alert = evaluateAlertRule(rule, runs, now);
    expect(alert).not.toBeNull();
  });

  it("does not fire when all runs are fast", () => {
    const runs = [
      makeRun({ id: "r1", startedAt: new Date("2025-06-01T10:30:00Z"), durationMs: 1000 }),
    ];
    const rule = makeRule({ condition: "slow_run", threshold: 30_000 });
    expect(evaluateAlertRule(rule, runs, now)).toBeNull();
  });
});

describe("evaluateAlertRule — no_runs", () => {
  const now = new Date("2025-06-01T11:00:00Z");

  it("fires when there are no runs in window", () => {
    const rule = makeRule({ condition: "no_runs", threshold: 0 });
    const alert = evaluateAlertRule(rule, [], now);
    expect(alert).not.toBeNull();
  });

  it("does not fire when there are runs", () => {
    const runs = [makeRun({ startedAt: new Date("2025-06-01T10:30:00Z") })];
    const rule = makeRule({ condition: "no_runs", threshold: 0 });
    expect(evaluateAlertRule(rule, runs, now)).toBeNull();
  });
});

describe("evaluateAlertRule — cooldown", () => {
  it("respects cooldown period", () => {
    const now = new Date("2025-06-01T11:00:00Z");
    const runs = [
      makeRun({ id: "r1", startedAt: new Date("2025-06-01T10:30:00Z"), status: "failed" }),
      makeRun({ id: "r2", startedAt: new Date("2025-06-01T10:31:00Z"), status: "failed" }),
      makeRun({ id: "r3", startedAt: new Date("2025-06-01T10:32:00Z"), status: "failed" }),
    ];
    const rule: AlertRule = {
      ...makeRule({ condition: "failure_rate_above", threshold: 50 }),
      cooldownMinutes: 30,
      lastTriggeredAt: new Date("2025-06-01T10:45:00Z"), // 15 min ago < 30 min cooldown
    };
    expect(evaluateAlertRule(rule, runs, now)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluateAllRules
// ─────────────────────────────────────────────────────────────────────────────

describe("evaluateAllRules", () => {
  it("fires multiple applicable rules", () => {
    const now = new Date("2025-06-01T11:00:00Z");
    const runs = [
      makeRun({ id: "r1", startedAt: new Date("2025-06-01T10:30:00Z"), status: "failed" }),
      makeRun({ id: "r2", startedAt: new Date("2025-06-01T10:31:00Z"), status: "failed" }),
      makeRun({ id: "r3", startedAt: new Date("2025-06-01T10:32:00Z"), status: "failed" }),
    ];
    const rules = [
      makeRule({ id: "r1", condition: "failure_rate_above", threshold: 50 }),
      makeRule({ id: "r2", condition: "consecutive_failures", threshold: 3 }),
    ];
    const alerts = evaluateAllRules(rules, runs, now);
    expect(alerts).toHaveLength(2);
  });

  it("returns empty when no rules fire", () => {
    const runs = [makeRun({ startedAt: new Date() })];
    const rules = [makeRule({ condition: "failure_rate_above", threshold: 50 })];
    const alerts = evaluateAllRules(rules, runs, new Date());
    expect(alerts).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveAlert / getUnresolvedAlerts / getWorkflowAlerts
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveAlert", () => {
  it("sets resolved to true and sets resolvedAt", () => {
    const alert = makeAlert();
    const now = new Date("2025-06-01T12:00:00Z");
    const resolved = resolveAlert(alert, now);
    expect(resolved.resolved).toBe(true);
    expect(resolved.resolvedAt).toEqual(now);
  });

  it("does not mutate original", () => {
    const alert = makeAlert();
    resolveAlert(alert);
    expect(alert.resolved).toBe(false);
  });
});

describe("getUnresolvedAlerts", () => {
  it("filters out resolved alerts", () => {
    const alerts = [
      makeAlert({ id: "a1", resolved: false }),
      makeAlert({ id: "a2", resolved: true }),
      makeAlert({ id: "a3", resolved: false }),
    ];
    const unresolved = getUnresolvedAlerts(alerts);
    expect(unresolved).toHaveLength(2);
    expect(unresolved.every((a) => !a.resolved)).toBe(true);
  });

  it("sorts by severity: critical first", () => {
    const alerts = [
      makeAlert({ id: "a1", severity: "info", resolved: false }),
      makeAlert({ id: "a2", severity: "critical", resolved: false }),
      makeAlert({ id: "a3", severity: "warning", resolved: false }),
    ];
    const sorted = getUnresolvedAlerts(alerts);
    expect(sorted[0].severity).toBe("critical");
    expect(sorted[1].severity).toBe("warning");
    expect(sorted[2].severity).toBe("info");
  });
});

describe("getWorkflowAlerts", () => {
  it("filters alerts by workflowId", () => {
    const alerts = [
      makeAlert({ id: "a1", workflowId: "wf1" }),
      makeAlert({ id: "a2", workflowId: "wf2" }),
      makeAlert({ id: "a3", workflowId: "wf1" }),
    ];
    const result = getWorkflowAlerts(alerts, "wf1");
    expect(result).toHaveLength(2);
    expect(result.every((a) => a.workflowId === "wf1")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// summarizeAlerts
// ─────────────────────────────────────────────────────────────────────────────

describe("summarizeAlerts", () => {
  it("returns zeroes for empty list", () => {
    const s = summarizeAlerts([]);
    expect(s.total).toBe(0);
    expect(s.unresolved).toBe(0);
  });

  it("counts by severity", () => {
    const alerts = [
      makeAlert({ id: "a1", severity: "critical", resolved: false }),
      makeAlert({ id: "a2", severity: "warning", resolved: false }),
      makeAlert({ id: "a3", severity: "critical", resolved: true }),
    ];
    const s = summarizeAlerts(alerts);
    expect(s.bySeverity.critical).toBe(2);
    expect(s.bySeverity.warning).toBe(1);
    expect(s.unresolved).toBe(2);
    expect(s.total).toBe(3);
  });

  it("counts by condition", () => {
    const alerts = [
      makeAlert({ id: "a1", condition: "failure_rate_above" }),
      makeAlert({ id: "a2", condition: "slow_run" }),
      makeAlert({ id: "a3", condition: "failure_rate_above" }),
    ];
    const s = summarizeAlerts(alerts);
    expect(s.byCondition.failure_rate_above).toBe(2);
    expect(s.byCondition.slow_run).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// groupRunsByHour
// ─────────────────────────────────────────────────────────────────────────────

describe("groupRunsByHour", () => {
  it("groups runs into hour buckets", () => {
    const runs = [
      makeRun({ id: "r1", startedAt: new Date("2025-06-01T10:15:00Z") }),
      makeRun({ id: "r2", startedAt: new Date("2025-06-01T10:45:00Z") }),
      makeRun({ id: "r3", startedAt: new Date("2025-06-01T11:05:00Z") }),
    ];
    const grouped = groupRunsByHour(runs);
    expect(grouped.get("2025-06-01T10")).toHaveLength(2);
    expect(grouped.get("2025-06-01T11")).toHaveLength(1);
  });

  it("returns empty map for empty runs", () => {
    expect(groupRunsByHour([]).size).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// rollingFailureRate
// ─────────────────────────────────────────────────────────────────────────────

describe("rollingFailureRate", () => {
  it("returns empty for empty runs", () => {
    expect(rollingFailureRate([], 5)).toEqual([]);
  });

  it("computes rolling failure rate over window", () => {
    const runs = [
      makeRun({ id: "r1", startedAt: new Date("2025-06-01T10:00:00Z"), status: "success" }),
      makeRun({ id: "r2", startedAt: new Date("2025-06-01T10:01:00Z"), status: "failed" }),
      makeRun({ id: "r3", startedAt: new Date("2025-06-01T10:02:00Z"), status: "failed" }),
      makeRun({ id: "r4", startedAt: new Date("2025-06-01T10:03:00Z"), status: "success" }),
    ];
    const rates = rollingFailureRate(runs, 2);
    expect(rates).toHaveLength(4);
    // window of 2: r1=0%, r1r2=50%, r2r3=100%, r3r4=50%
    expect(rates[0]).toBe(0);
    expect(rates[1]).toBe(50);
    expect(rates[2]).toBe(100);
    expect(rates[3]).toBe(50);
  });
});
