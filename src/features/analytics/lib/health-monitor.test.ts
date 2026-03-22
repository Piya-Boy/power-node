import { describe, it, expect } from "vitest";
import {
  detectIssues,
  computeHealthScore,
  compareHealthScores,
  computeFleetHealth,
  filterByStatus,
  sortByHealthScore,
  type WorkflowHealthSnapshot,
  type HealthScore,
} from "./health-monitor";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<WorkflowHealthSnapshot> = {}): WorkflowHealthSnapshot {
  return {
    workflowId: "wf1",
    collectedAt: new Date("2025-06-01"),
    avgDurationMs: 1000,
    p95DurationMs: 5000,
    p99DurationMs: 10000,
    successRate: 99,
    failureRate: 1,
    consecutiveFailures: 0,
    totalRunsLast24h: 10,
    totalRunsLast7d: 70,
    estimatedMonthlyCostUsd: 10,
    nodeCount: 5,
    hasUnencryptedCredentials: false,
    exposedSecrets: 0,
    hasMissingRequiredInputs: false,
    hasOrphanedNodes: false,
    ...overrides,
  };
}

function makeScore(overrides: Partial<HealthScore> = {}): HealthScore {
  return computeHealthScore(makeSnapshot({ workflowId: overrides.workflowId ?? "wf1" }));
}

// ─────────────────────────────────────────────────────────────────────────────
// detectIssues
// ─────────────────────────────────────────────────────────────────────────────

describe("detectIssues", () => {
  it("returns no issues for a healthy snapshot", () => {
    expect(detectIssues(makeSnapshot())).toHaveLength(0);
  });

  it("detects high average duration (warning)", () => {
    const issues = detectIssues(makeSnapshot({ avgDurationMs: 35_000 }));
    const perf = issues.find((i) => i.affectedField === "avgDurationMs");
    expect(perf).toBeDefined();
    expect(perf?.severity).toBe("warning");
    expect(perf?.category).toBe("performance");
  });

  it("detects very high average duration (critical)", () => {
    const issues = detectIssues(makeSnapshot({ avgDurationMs: 70_000 }));
    const perf = issues.find((i) => i.affectedField === "avgDurationMs");
    expect(perf?.severity).toBe("critical");
  });

  it("detects high p95 duration", () => {
    const issues = detectIssues(makeSnapshot({ p95DurationMs: 70_000 }));
    expect(issues.some((i) => i.affectedField === "p95DurationMs")).toBe(true);
  });

  it("detects low success rate (warning)", () => {
    const issues = detectIssues(makeSnapshot({ successRate: 90 }));
    const issue = issues.find((i) => i.affectedField === "successRate");
    expect(issue?.severity).toBe("warning");
  });

  it("detects very low success rate (critical)", () => {
    const issues = detectIssues(makeSnapshot({ successRate: 70 }));
    expect(issues.find((i) => i.affectedField === "successRate")?.severity).toBe("critical");
  });

  it("detects consecutive failures", () => {
    const issues = detectIssues(makeSnapshot({ consecutiveFailures: 5 }));
    const issue = issues.find((i) => i.affectedField === "consecutiveFailures");
    expect(issue?.severity).toBe("critical");
  });

  it("detects no-activity warning", () => {
    const lastRunAt = new Date(Date.now() - 3 * 86_400_000); // 3 days ago
    const issues = detectIssues(makeSnapshot({ totalRunsLast24h: 0, lastRunAt }));
    expect(issues.some((i) => i.affectedField === "totalRunsLast24h")).toBe(true);
  });

  it("detects unencrypted credentials", () => {
    const issues = detectIssues(makeSnapshot({ hasUnencryptedCredentials: true }));
    const issue = issues.find((i) => i.affectedField === "hasUnencryptedCredentials");
    expect(issue?.severity).toBe("critical");
    expect(issue?.category).toBe("security");
  });

  it("detects exposed secrets", () => {
    const issues = detectIssues(makeSnapshot({ exposedSecrets: 2 }));
    expect(issues.some((i) => i.affectedField === "exposedSecrets")).toBe(true);
  });

  it("detects missing required inputs", () => {
    const issues = detectIssues(makeSnapshot({ hasMissingRequiredInputs: true }));
    const issue = issues.find((i) => i.affectedField === "hasMissingRequiredInputs");
    expect(issue?.category).toBe("configuration");
    expect(issue?.severity).toBe("warning");
  });

  it("detects orphaned nodes", () => {
    const issues = detectIssues(makeSnapshot({ hasOrphanedNodes: true }));
    expect(issues.some((i) => i.affectedField === "hasOrphanedNodes")).toBe(true);
  });

  it("detects high cost (warning)", () => {
    const issues = detectIssues(makeSnapshot({ estimatedMonthlyCostUsd: 150 }));
    const issue = issues.find((i) => i.affectedField === "estimatedMonthlyCostUsd");
    expect(issue?.severity).toBe("warning");
  });

  it("detects very high cost (critical)", () => {
    const issues = detectIssues(makeSnapshot({ estimatedMonthlyCostUsd: 250 }));
    expect(issues.find((i) => i.affectedField === "estimatedMonthlyCostUsd")?.severity).toBe("critical");
  });

  it("respects custom thresholds", () => {
    const issues = detectIssues(
      makeSnapshot({ successRate: 90 }),
      { minSuccessRate: 85 }  // lower threshold
    );
    expect(issues.find((i) => i.affectedField === "successRate")).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeHealthScore
// ─────────────────────────────────────────────────────────────────────────────

describe("computeHealthScore", () => {
  it("gives a perfect score for healthy snapshot", () => {
    const score = computeHealthScore(makeSnapshot());
    expect(score.overallScore).toBe(100);
    expect(score.status).toBe("healthy");
    expect(score.grade).toBe("A");
    expect(score.issues).toHaveLength(0);
  });

  it("degrades score with issues", () => {
    const snapshot = makeSnapshot({
      successRate: 70,
      consecutiveFailures: 5,
      hasUnencryptedCredentials: true,
    });
    const score = computeHealthScore(snapshot);
    expect(score.overallScore).toBeLessThan(100);
    expect(score.issues.length).toBeGreaterThan(0);
  });

  it("assigns correct status based on score", () => {
    const critical = computeHealthScore(makeSnapshot({
      successRate: 50,
      consecutiveFailures: 10,
      hasUnencryptedCredentials: true,
      exposedSecrets: 5,
      estimatedMonthlyCostUsd: 500,
    }));
    expect(["degraded", "critical"]).toContain(critical.status);
  });

  it("assigns grades correctly", () => {
    const perfect = computeHealthScore(makeSnapshot());
    expect(perfect.grade).toBe("A");
  });

  it("includes category scores", () => {
    const score = computeHealthScore(makeSnapshot());
    expect(score.categoryScores.performance).toBe(100);
    expect(score.categoryScores.reliability).toBe(100);
    expect(score.categoryScores.security).toBe(100);
  });

  it("reduces security score for security issues", () => {
    const score = computeHealthScore(makeSnapshot({ hasUnencryptedCredentials: true }));
    expect(score.categoryScores.security).toBeLessThan(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// compareHealthScores
// ─────────────────────────────────────────────────────────────────────────────

describe("compareHealthScores", () => {
  it("detects improving trend", () => {
    const prev = computeHealthScore(makeSnapshot({ successRate: 50, consecutiveFailures: 5 }));
    const curr = computeHealthScore(makeSnapshot({ successRate: 99 }));
    const { trend, scoreDelta } = compareHealthScores(prev, curr);
    expect(trend).toBe("improving");
    expect(scoreDelta).toBeGreaterThan(0);
  });

  it("detects degrading trend", () => {
    const prev = computeHealthScore(makeSnapshot());
    const curr = computeHealthScore(makeSnapshot({ successRate: 70, consecutiveFailures: 5 }));
    const { trend } = compareHealthScores(prev, curr);
    expect(trend).toBe("degrading");
  });

  it("detects stable trend", () => {
    const prev = computeHealthScore(makeSnapshot());
    const curr = computeHealthScore(makeSnapshot()); // identical
    const { trend } = compareHealthScores(prev, curr);
    expect(trend).toBe("stable");
  });

  it("identifies new issues", () => {
    const prev = computeHealthScore(makeSnapshot());
    const curr = computeHealthScore(makeSnapshot({ hasUnencryptedCredentials: true }));
    const { newIssues } = compareHealthScores(prev, curr);
    expect(newIssues.length).toBeGreaterThan(0);
  });

  it("identifies resolved issues", () => {
    const prev = computeHealthScore(makeSnapshot({ hasUnencryptedCredentials: true }));
    const curr = computeHealthScore(makeSnapshot());
    const { resolvedIssues } = compareHealthScores(prev, curr);
    expect(resolvedIssues.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeFleetHealth
// ─────────────────────────────────────────────────────────────────────────────

describe("computeFleetHealth", () => {
  it("handles empty fleet", () => {
    const fleet = computeFleetHealth([]);
    expect(fleet.totalWorkflows).toBe(0);
    expect(fleet.avgScore).toBe(0);
  });

  it("counts healthy/degraded/critical workflows", () => {
    const scores = [
      computeHealthScore(makeSnapshot({ workflowId: "wf1" })),
      computeHealthScore(makeSnapshot({ workflowId: "wf2", successRate: 70, consecutiveFailures: 5 })),
      computeHealthScore(makeSnapshot({ workflowId: "wf3" })),
    ];
    const fleet = computeFleetHealth(scores);
    expect(fleet.totalWorkflows).toBe(3);
    expect(fleet.healthy).toBeGreaterThan(0);
  });

  it("computes average score", () => {
    const scores = [
      computeHealthScore(makeSnapshot({ workflowId: "wf1" })), // 100
      computeHealthScore(makeSnapshot({ workflowId: "wf2", successRate: 70, consecutiveFailures: 5 })),
    ];
    const fleet = computeFleetHealth(scores);
    expect(fleet.avgScore).toBeGreaterThan(0);
    expect(fleet.avgScore).toBeLessThanOrEqual(100);
  });

  it("identifies top issues across fleet", () => {
    const scores = [
      computeHealthScore(makeSnapshot({ workflowId: "wf1", hasUnencryptedCredentials: true })),
      computeHealthScore(makeSnapshot({ workflowId: "wf2", hasUnencryptedCredentials: true })),
    ];
    const fleet = computeFleetHealth(scores);
    expect(fleet.topIssues.some((i) => i.title.includes("Unencrypted"))).toBe(true);
    expect(fleet.topIssues.find((i) => i.title.includes("Unencrypted"))?.count).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// filterByStatus / sortByHealthScore
// ─────────────────────────────────────────────────────────────────────────────

describe("filterByStatus", () => {
  it("filters to healthy workflows", () => {
    const scores = [
      computeHealthScore(makeSnapshot({ workflowId: "wf1" })),
      computeHealthScore(makeSnapshot({ workflowId: "wf2", successRate: 50, consecutiveFailures: 10 })),
    ];
    const healthy = filterByStatus(scores, "healthy");
    expect(healthy.every((s) => s.status === "healthy")).toBe(true);
  });
});

describe("sortByHealthScore", () => {
  it("sorts ascending (worst first) by default", () => {
    const scores = [
      computeHealthScore(makeSnapshot({ workflowId: "wf1" })),
      computeHealthScore(makeSnapshot({ workflowId: "wf2", hasUnencryptedCredentials: true })),
    ];
    const sorted = sortByHealthScore(scores);
    expect(sorted[0].overallScore).toBeLessThanOrEqual(sorted[1].overallScore);
  });

  it("sorts descending (best first)", () => {
    const scores = [
      computeHealthScore(makeSnapshot({ workflowId: "wf1" })),
      computeHealthScore(makeSnapshot({ workflowId: "wf2", hasUnencryptedCredentials: true })),
    ];
    const sorted = sortByHealthScore(scores, "desc");
    expect(sorted[0].overallScore).toBeGreaterThanOrEqual(sorted[1].overallScore);
  });
});
