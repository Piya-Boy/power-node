import { describe, it, expect } from "vitest";
import {
  computeWorkflowInsights,
  computeAllInsights,
  buildExecutionTimeSeries,
  buildSuccessRateTimeSeries,
  computeDashboardMetrics,
  detectBottlenecks,
  estimateSavings,
  aggregateSavings,
  computeTrend,
  comparePeriods,
  type ExecutionDataPoint,
} from "./insights-dashboard";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const makeExec = (overrides: Partial<ExecutionDataPoint> = {}): ExecutionDataPoint => ({
  workflowId: "wf-1",
  workflowName: "My Workflow",
  executedAt: new Date("2024-06-15T10:00:00Z"),
  durationMs: 2_000,
  status: "success",
  triggeredBy: "schedule",
  nodeCount: 5,
  ...overrides,
});

const makeExecSet = (
  workflowId: string,
  count: number,
  successRate: number,
  avgDurationMs = 2000
): ExecutionDataPoint[] => {
  return Array.from({ length: count }, (_, i) => makeExec({
    workflowId,
    workflowName: `Workflow ${workflowId}`,
    executedAt: new Date(Date.now() - i * 60_000),
    status: Math.random() < successRate ? "success" : "failed",
    durationMs: avgDurationMs + Math.random() * 1000,
  }));
};

// ─────────────────────────────────────────────────────────────────────────────
// computeWorkflowInsights
// ─────────────────────────────────────────────────────────────────────────────

describe("computeWorkflowInsights", () => {
  it("returns null for unknown workflowId", () => {
    expect(computeWorkflowInsights([], "wf-unknown")).toBeNull();
  });

  it("computes basic metrics", () => {
    const execs = [
      makeExec({ status: "success", durationMs: 1000 }),
      makeExec({ status: "success", durationMs: 2000 }),
      makeExec({ status: "failed", durationMs: 500 }),
    ];
    const insights = computeWorkflowInsights(execs, "wf-1")!;
    expect(insights.totalExecutions).toBe(3);
    expect(insights.successCount).toBe(2);
    expect(insights.failureCount).toBe(1);
    expect(insights.successRate).toBeCloseTo(67, 0);
    expect(insights.avgDurationMs).toBeGreaterThan(0);
  });

  it("computes p95 duration", () => {
    const execs = Array.from({ length: 100 }, (_, i) =>
      makeExec({ durationMs: (i + 1) * 100 }) // 100ms to 10000ms
    );
    const insights = computeWorkflowInsights(execs, "wf-1")!;
    // p95 should be around 9500-10000ms
    expect(insights.p95DurationMs).toBeGreaterThan(9000);
  });

  it("computes total cost", () => {
    const execs = [
      makeExec({ cost: 0.01 }),
      makeExec({ cost: 0.02 }),
      makeExec({ cost: undefined }),
    ];
    const insights = computeWorkflowInsights(execs, "wf-1")!;
    expect(insights.totalCost).toBeCloseTo(0.03, 2);
  });

  it("detects upward trend", () => {
    // All early execs fail, all recent execs succeed
    const failing = Array.from({ length: 5 }, () => makeExec({ status: "failed" }));
    const succeeding = Array.from({ length: 5 }, () => makeExec({ status: "success" }));
    const insights = computeWorkflowInsights([...failing, ...succeeding], "wf-1")!;
    expect(insights.trend).toBe("up");
  });

  it("detects stable trend", () => {
    const execs = Array.from({ length: 10 }, () => makeExec({ status: "success" }));
    const insights = computeWorkflowInsights(execs, "wf-1")!;
    expect(insights.trend).toBe("stable");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeAllInsights
// ─────────────────────────────────────────────────────────────────────────────

describe("computeAllInsights", () => {
  it("computes insights for all workflows", () => {
    const execs = [
      ...makeExecSet("wf-1", 10, 0.9),
      ...makeExecSet("wf-2", 10, 0.3),
    ];
    const insights = computeAllInsights(execs);
    expect(insights).toHaveLength(2);
    const wf1 = insights.find((i) => i.workflowId === "wf-1")!;
    const wf2 = insights.find((i) => i.workflowId === "wf-2")!;
    expect(wf1.successRate).toBeGreaterThan(wf2.successRate);
  });

  it("marks top failure rate workflows", () => {
    const execs = [
      ...makeExecSet("wf-1", 10, 1.0),    // 100% success
      ...makeExecSet("wf-2", 10, 0.5),    // 50% success
      ...makeExecSet("wf-3", 10, 0.1),    // 10% success
      ...makeExecSet("wf-4", 10, 0.9),    // 90% success
      ...makeExecSet("wf-5", 10, 0.95),   // 95% success
    ];
    const insights = computeAllInsights(execs);
    const topFailure = insights.filter((i) => i.topFailureRate);
    expect(topFailure.length).toBeGreaterThan(0);
    // wf-3 (10% success) should be in top failure
    expect(topFailure.some((i) => i.workflowId === "wf-3")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildExecutionTimeSeries
// ─────────────────────────────────────────────────────────────────────────────

describe("buildExecutionTimeSeries", () => {
  it("buckets executions by day", () => {
    const start = new Date("2024-06-01T00:00:00Z");
    const end = new Date("2024-06-04T00:00:00Z");
    const execs = [
      makeExec({ executedAt: new Date("2024-06-01T10:00:00Z") }),
      makeExec({ executedAt: new Date("2024-06-01T15:00:00Z") }),
      makeExec({ executedAt: new Date("2024-06-02T09:00:00Z") }),
    ];
    const series = buildExecutionTimeSeries(execs, "day", start, end);
    expect(series.granularity).toBe("day");
    expect(series.points).toHaveLength(3); // 3 days
    expect(series.points[0].value).toBe(2); // 2 on June 1
    expect(series.points[1].value).toBe(1); // 1 on June 2
    expect(series.points[2].value).toBe(0); // 0 on June 3
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildSuccessRateTimeSeries
// ─────────────────────────────────────────────────────────────────────────────

describe("buildSuccessRateTimeSeries", () => {
  it("computes success rate per day", () => {
    const start = new Date("2024-06-01T00:00:00Z");
    const end = new Date("2024-06-03T00:00:00Z");
    const execs = [
      makeExec({ executedAt: new Date("2024-06-01T10:00:00Z"), status: "success" }),
      makeExec({ executedAt: new Date("2024-06-01T11:00:00Z"), status: "failed" }),
      makeExec({ executedAt: new Date("2024-06-02T09:00:00Z"), status: "success" }),
    ];
    const series = buildSuccessRateTimeSeries(execs, "day", start, end);
    expect(series.points[0].value).toBe(50); // 1/2 = 50%
    expect(series.points[1].value).toBe(100); // 1/1 = 100%
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeDashboardMetrics
// ─────────────────────────────────────────────────────────────────────────────

describe("computeDashboardMetrics", () => {
  it("computes correct metrics for period", () => {
    const period = {
      start: new Date("2024-06-01T00:00:00Z"),
      end: new Date("2024-06-30T23:59:59Z"),
    };
    const execs = [
      makeExec({ executedAt: new Date("2024-06-15T10:00:00Z"), status: "success", cost: 0.01 }),
      makeExec({ executedAt: new Date("2024-06-16T10:00:00Z"), status: "failed", cost: 0.02 }),
      makeExec({ executedAt: new Date("2024-06-17T10:00:00Z"), status: "success", triggeredBy: "webhook" }),
      // out-of-period
      makeExec({ executedAt: new Date("2024-07-01T10:00:00Z"), status: "success" }),
    ];
    const metrics = computeDashboardMetrics(execs, period);
    expect(metrics.totalExecutions).toBe(3);
    expect(metrics.successfulExecutions).toBe(2);
    expect(metrics.failedExecutions).toBe(1);
    expect(metrics.overallSuccessRate).toBeCloseTo(67, 0);
    expect(metrics.totalCost).toBeCloseTo(0.03, 2);
    expect(metrics.uniqueWorkflows).toBe(1);
  });

  it("identifies most used trigger", () => {
    const period = { start: new Date("2020-01-01"), end: new Date("2030-01-01") };
    const execs = [
      makeExec({ triggeredBy: "webhook" }),
      makeExec({ triggeredBy: "webhook" }),
      makeExec({ triggeredBy: "schedule" }),
    ];
    const metrics = computeDashboardMetrics(execs, period);
    expect(metrics.mostUsedTrigger).toBe("webhook");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// detectBottlenecks
// ─────────────────────────────────────────────────────────────────────────────

describe("detectBottlenecks", () => {
  it("detects slow executions", () => {
    const insights = [computeWorkflowInsights(
      [makeExec({ durationMs: 100_000 })], "wf-1"
    )!];
    const bottlenecks = detectBottlenecks(insights, { slowExecutionMs: 30_000, highFailureRatePercent: 20, highCostUsd: 10, timeoutMs: 60_000 });
    expect(bottlenecks.some((b) => b.type === "slow_execution")).toBe(true);
  });

  it("detects high failure rate", () => {
    const execs = Array.from({ length: 10 }, (_, i) =>
      makeExec({ status: i < 6 ? "failed" : "success" })
    );
    const insights = [computeWorkflowInsights(execs, "wf-1")!];
    const bottlenecks = detectBottlenecks(insights);
    expect(bottlenecks.some((b) => b.type === "high_failure")).toBe(true);
  });

  it("detects high cost per execution", () => {
    const execs = [makeExec({ cost: 100, durationMs: 1000 })];
    const insights = [computeWorkflowInsights(execs, "wf-1")!];
    const bottlenecks = detectBottlenecks(insights, { slowExecutionMs: 30_000, highFailureRatePercent: 20, highCostUsd: 10, timeoutMs: 60_000 });
    expect(bottlenecks.some((b) => b.type === "high_cost")).toBe(true);
  });

  it("sorts by severity (critical first)", () => {
    const slowExecs = [makeExec({ durationMs: 300_000, status: "success" })];
    const insights = [
      computeWorkflowInsights(slowExecs, "wf-1")!,
    ];
    const bottlenecks = detectBottlenecks(insights, { slowExecutionMs: 30_000, highFailureRatePercent: 20, highCostUsd: 10, timeoutMs: 60_000 });
    expect(bottlenecks).toHaveLength(2); // slow_execution + timeout
    expect(bottlenecks[0].severity).toBe("critical"); // 300s > 30s * 3
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// estimateSavings
// ─────────────────────────────────────────────────────────────────────────────

describe("estimateSavings", () => {
  it("estimates monthly and annual savings", () => {
    const estimate = estimateSavings({
      workflowId: "wf-1",
      workflowName: "Report Generator",
      executionsPerMonth: 100,
      avgManualTimeMinutes: 30,
      avgExecutionMs: 60_000, // 1 minute
      costPerHour: 60,
    });
    expect(estimate.timeSavedPerMonth).toBeGreaterThan(0);
    expect(estimate.monthlySavingsUsd).toBeGreaterThan(0);
    expect(estimate.annualSavingsUsd).toBeCloseTo(estimate.monthlySavingsUsd * 12, 1);
    // 29 min saved * 100 exec = 2900 min = 48.3h * $60 = $2900
    expect(estimate.monthlySavingsUsd).toBeGreaterThan(2000);
  });

  it("uses default cost per hour when not specified", () => {
    const estimate = estimateSavings({
      workflowId: "wf-1",
      workflowName: "Test",
      executionsPerMonth: 10,
      avgManualTimeMinutes: 10,
      avgExecutionMs: 30_000,
    });
    expect(estimate.costPerHour).toBe(50);
  });
});

describe("aggregateSavings", () => {
  it("aggregates total savings", () => {
    const estimates = [
      estimateSavings({ workflowId: "w1", workflowName: "W1", executionsPerMonth: 100, avgManualTimeMinutes: 30, avgExecutionMs: 60_000 }),
      estimateSavings({ workflowId: "w2", workflowName: "W2", executionsPerMonth: 50, avgManualTimeMinutes: 20, avgExecutionMs: 30_000 }),
    ];
    const total = aggregateSavings(estimates);
    expect(total.totalMonthlySavingsUsd).toBeGreaterThan(0);
    expect(total.totalAnnualSavingsUsd).toBeCloseTo(total.totalMonthlySavingsUsd * 12, 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeTrend / comparePeriods
// ─────────────────────────────────────────────────────────────────────────────

describe("computeTrend", () => {
  it("detects upward trend", () => {
    const trend = computeTrend(120, 100, "executions");
    expect(trend.direction).toBe("up");
    expect(trend.changePercent).toBe(20);
    expect(trend.isSignificant).toBe(true);
  });

  it("detects downward trend", () => {
    const trend = computeTrend(80, 100, "executions");
    expect(trend.direction).toBe("down");
    expect(trend.changePercent).toBe(-20);
  });

  it("detects stable trend", () => {
    const trend = computeTrend(103, 100, "executions");
    expect(trend.direction).toBe("stable");
    expect(trend.isSignificant).toBe(false);
  });

  it("handles zero previous value", () => {
    const trend = computeTrend(10, 0, "executions");
    expect(trend.changePercent).toBe(100);
    expect(trend.direction).toBe("up");
  });
});

describe("comparePeriods", () => {
  const makePeriodMetrics = (execCount: number, successRate: number): ReturnType<typeof computeDashboardMetrics> => {
    const execs = Array.from({ length: execCount }, () =>
      makeExec({ status: Math.random() < successRate / 100 ? "success" : "failed" })
    );
    return computeDashboardMetrics(execs, { start: new Date("2020-01-01"), end: new Date("2030-01-01") });
  };

  it("returns 4 trend analyses", () => {
    const current = makePeriodMetrics(100, 90);
    const previous = makePeriodMetrics(80, 85);
    const trends = comparePeriods(current, previous);
    expect(trends).toHaveLength(4);
    expect(trends.map((t) => t.metric)).toContain("total_executions");
    expect(trends.map((t) => t.metric)).toContain("success_rate");
  });
});
