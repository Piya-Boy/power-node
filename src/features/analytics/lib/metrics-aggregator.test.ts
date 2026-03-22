import { describe, it, expect } from "vitest";
import {
  percentile,
  sortAsc,
  truncateToGranularity,
  getBucketEnd,
  bucketExecutions,
  aggregateExecutions,
  extractTrend,
  filterToWindow,
  filterByWorkflow,
  filterByTag,
  compareMetricWindows,
  summarizeFleetMetrics,
  type ExecutionRecord,
  type AggregatedMetrics,
} from "./metrics-aggregator";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeExec(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  return {
    executionId: "ex1",
    workflowId: "wf1",
    startedAt: new Date("2025-06-01T10:00:00Z"),
    endedAt: new Date("2025-06-01T10:00:01Z"),
    success: true,
    durationMs: 1000,
    retryCount: 0,
    costUsd: 0.01,
    queueWaitMs: 50,
    tags: [],
    ...overrides,
  };
}

function makeAggregated(overrides: Partial<AggregatedMetrics> = {}): AggregatedMetrics {
  return {
    workflowId: "wf1",
    windowStart: new Date("2025-06-01"),
    windowEnd: new Date("2025-06-02"),
    totalRuns: 10,
    successCount: 9,
    failureCount: 1,
    successRate: 90,
    failureRate: 10,
    avgDurationMs: 1000,
    p50DurationMs: 900,
    p95DurationMs: 3000,
    p99DurationMs: 5000,
    maxDurationMs: 5000,
    minDurationMs: 200,
    totalCostUsd: 1.0,
    avgCostUsd: 0.1,
    totalRetries: 2,
    avgRetries: 0.2,
    avgQueueWaitMs: 50,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// percentile
// ─────────────────────────────────────────────────────────────────────────────

describe("percentile", () => {
  it("returns 0 for empty array", () => {
    expect(percentile([], 50)).toBe(0);
  });

  it("returns only element for single item", () => {
    expect(percentile([42], 50)).toBe(42);
  });

  it("computes p50 correctly", () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5);
  });

  it("computes p95 correctly", () => {
    const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(sorted, 95)).toBe(95);
  });

  it("returns first element for p=0", () => {
    expect(percentile([10, 20, 30], 0)).toBe(10);
  });

  it("returns last element for p=100", () => {
    expect(percentile([10, 20, 30], 100)).toBe(30);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sortAsc
// ─────────────────────────────────────────────────────────────────────────────

describe("sortAsc", () => {
  it("sorts ascending", () => {
    expect(sortAsc([3, 1, 2])).toEqual([1, 2, 3]);
  });

  it("does not mutate input", () => {
    const arr = [3, 1, 2];
    sortAsc(arr);
    expect(arr).toEqual([3, 1, 2]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// truncateToGranularity
// ─────────────────────────────────────────────────────────────────────────────

describe("truncateToGranularity", () => {
  const d = new Date("2025-06-04T14:32:17.500Z");

  it("truncates to minute", () => {
    const t = truncateToGranularity(d, "minute");
    expect(t.toISOString()).toBe("2025-06-04T14:32:00.000Z");
  });

  it("truncates to hour", () => {
    const t = truncateToGranularity(d, "hour");
    expect(t.toISOString()).toBe("2025-06-04T14:00:00.000Z");
  });

  it("truncates to day", () => {
    const t = truncateToGranularity(d, "day");
    expect(t.toISOString()).toBe("2025-06-04T00:00:00.000Z");
  });

  it("truncates to week (Sunday)", () => {
    // 2025-06-04 is a Wednesday; Sunday = 2025-06-01
    const t = truncateToGranularity(d, "week");
    expect(t.toISOString()).toBe("2025-06-01T00:00:00.000Z");
  });

  it("truncates to month", () => {
    const t = truncateToGranularity(d, "month");
    expect(t.toISOString()).toBe("2025-06-01T00:00:00.000Z");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getBucketEnd
// ─────────────────────────────────────────────────────────────────────────────

describe("getBucketEnd", () => {
  const d = new Date("2025-06-04T14:00:00.000Z");

  it("adds 1 minute", () => {
    expect(getBucketEnd(d, "minute").toISOString()).toBe("2025-06-04T14:01:00.000Z");
  });

  it("adds 1 hour", () => {
    expect(getBucketEnd(d, "hour").toISOString()).toBe("2025-06-04T15:00:00.000Z");
  });

  it("adds 1 day", () => {
    expect(getBucketEnd(d, "day").toISOString()).toBe("2025-06-05T14:00:00.000Z");
  });

  it("adds 7 days for week", () => {
    expect(getBucketEnd(d, "week").toISOString()).toBe("2025-06-11T14:00:00.000Z");
  });

  it("adds 1 month", () => {
    expect(getBucketEnd(d, "month").toISOString()).toBe("2025-07-04T14:00:00.000Z");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// bucketExecutions
// ─────────────────────────────────────────────────────────────────────────────

describe("bucketExecutions", () => {
  it("returns empty for no executions", () => {
    expect(bucketExecutions([], "hour")).toHaveLength(0);
  });

  it("buckets executions by hour", () => {
    const execs = [
      makeExec({ executionId: "e1", startedAt: new Date("2025-06-01T10:00:00Z"), durationMs: 100 }),
      makeExec({ executionId: "e2", startedAt: new Date("2025-06-01T10:30:00Z"), durationMs: 200 }),
      makeExec({ executionId: "e3", startedAt: new Date("2025-06-01T11:00:00Z"), durationMs: 300 }),
    ];
    const buckets = bucketExecutions(execs, "hour");
    expect(buckets).toHaveLength(2);
    expect(buckets[0].count).toBe(2);
    expect(buckets[1].count).toBe(1);
  });

  it("computes success/failure counts per bucket", () => {
    const execs = [
      makeExec({ executionId: "e1", startedAt: new Date("2025-06-01T10:00:00Z"), success: true }),
      makeExec({ executionId: "e2", startedAt: new Date("2025-06-01T10:00:00Z"), success: false }),
    ];
    const [bucket] = bucketExecutions(execs, "hour");
    expect(bucket.successCount).toBe(1);
    expect(bucket.failureCount).toBe(1);
  });

  it("computes avg duration per bucket", () => {
    const execs = [
      makeExec({ executionId: "e1", startedAt: new Date("2025-06-01T10:00:00Z"), durationMs: 1000 }),
      makeExec({ executionId: "e2", startedAt: new Date("2025-06-01T10:15:00Z"), durationMs: 2000 }),
    ];
    const [bucket] = bucketExecutions(execs, "hour");
    expect(bucket.avgDurationMs).toBe(1500);
  });

  it("sorts buckets chronologically", () => {
    const execs = [
      makeExec({ executionId: "e1", startedAt: new Date("2025-06-01T12:00:00Z") }),
      makeExec({ executionId: "e2", startedAt: new Date("2025-06-01T08:00:00Z") }),
    ];
    const buckets = bucketExecutions(execs, "hour");
    expect(buckets[0].startAt < buckets[1].startAt).toBe(true);
  });

  it("computes p95/p99 durations", () => {
    const durations = Array.from({ length: 100 }, (_, i) => i + 1);
    const execs = durations.map((d, i) =>
      makeExec({ executionId: `e${i}`, startedAt: new Date("2025-06-01T10:00:00Z"), durationMs: d })
    );
    const [bucket] = bucketExecutions(execs, "hour");
    expect(bucket.p95DurationMs).toBe(95);
    expect(bucket.p99DurationMs).toBe(99);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// aggregateExecutions
// ─────────────────────────────────────────────────────────────────────────────

describe("aggregateExecutions", () => {
  const window = {
    start: new Date("2025-06-01T00:00:00Z"),
    end: new Date("2025-06-02T00:00:00Z"),
  };

  it("returns zeros for empty executions", () => {
    const result = aggregateExecutions("wf1", [], window.start, window.end);
    expect(result.totalRuns).toBe(0);
    expect(result.successRate).toBe(0);
    expect(result.avgDurationMs).toBe(0);
  });

  it("filters to window only", () => {
    const execs = [
      makeExec({ executionId: "e1", startedAt: new Date("2025-06-01T10:00:00Z") }),
      makeExec({ executionId: "e2", startedAt: new Date("2025-06-02T10:00:00Z") }), // out of window
    ];
    const result = aggregateExecutions("wf1", execs, window.start, window.end);
    expect(result.totalRuns).toBe(1);
  });

  it("computes success rate", () => {
    const execs = [
      makeExec({ executionId: "e1", success: true }),
      makeExec({ executionId: "e2", success: true }),
      makeExec({ executionId: "e3", success: false }),
      makeExec({ executionId: "e4", success: false }),
    ].map((e) => ({ ...e, startedAt: new Date("2025-06-01T10:00:00Z") }));
    const result = aggregateExecutions("wf1", execs, window.start, window.end);
    expect(result.successRate).toBe(50);
    expect(result.failureRate).toBe(50);
  });

  it("computes min/max duration", () => {
    const execs = [100, 500, 200, 1000].map((d, i) =>
      makeExec({ executionId: `e${i}`, durationMs: d, startedAt: new Date("2025-06-01T10:00:00Z") })
    );
    const result = aggregateExecutions("wf1", execs, window.start, window.end);
    expect(result.minDurationMs).toBe(100);
    expect(result.maxDurationMs).toBe(1000);
  });

  it("computes total cost and avg cost", () => {
    const execs = [0.1, 0.2, 0.3].map((c, i) =>
      makeExec({ executionId: `e${i}`, costUsd: c, startedAt: new Date("2025-06-01T10:00:00Z") })
    );
    const result = aggregateExecutions("wf1", execs, window.start, window.end);
    expect(result.totalCostUsd).toBeCloseTo(0.6);
    expect(result.avgCostUsd).toBeCloseTo(0.2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// extractTrend
// ─────────────────────────────────────────────────────────────────────────────

describe("extractTrend", () => {
  it("returns flat for empty buckets", () => {
    const trend = extractTrend([], "run_count");
    expect(trend.direction).toBe("flat");
    expect(trend.points).toHaveLength(0);
  });

  it("detects upward trend", () => {
    const execs1 = Array.from({ length: 10 }, (_, i) =>
      makeExec({ executionId: `h1e${i}`, startedAt: new Date("2025-06-01T10:00:00Z") })
    );
    const execs2 = Array.from({ length: 100 }, (_, i) =>
      makeExec({ executionId: `h2e${i}`, startedAt: new Date("2025-06-01T11:00:00Z") })
    );
    const buckets = bucketExecutions([...execs1, ...execs2], "hour");
    const trend = extractTrend(buckets, "run_count");
    expect(trend.direction).toBe("up");
    expect(trend.changePercent).toBeGreaterThan(5);
  });

  it("detects downward trend", () => {
    const execs1 = Array.from({ length: 100 }, (_, i) =>
      makeExec({ executionId: `h1e${i}`, startedAt: new Date("2025-06-01T10:00:00Z") })
    );
    const execs2 = Array.from({ length: 10 }, (_, i) =>
      makeExec({ executionId: `h2e${i}`, startedAt: new Date("2025-06-01T11:00:00Z") })
    );
    const buckets = bucketExecutions([...execs1, ...execs2], "hour");
    const trend = extractTrend(buckets, "run_count");
    expect(trend.direction).toBe("down");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// filterToWindow / filterByWorkflow / filterByTag
// ─────────────────────────────────────────────────────────────────────────────

describe("filterToWindow", () => {
  it("filters to window", () => {
    const execs = [
      makeExec({ executionId: "e1", startedAt: new Date("2025-06-01T00:00:00Z") }),
      makeExec({ executionId: "e2", startedAt: new Date("2025-06-02T00:00:00Z") }),
    ];
    const filtered = filterToWindow(execs, new Date("2025-06-01"), new Date("2025-06-02"));
    expect(filtered).toHaveLength(1);
    expect(filtered[0].executionId).toBe("e1");
  });
});

describe("filterByWorkflow", () => {
  it("filters by workflow id", () => {
    const execs = [
      makeExec({ executionId: "e1", workflowId: "wf1" }),
      makeExec({ executionId: "e2", workflowId: "wf2" }),
    ];
    expect(filterByWorkflow(execs, "wf1")).toHaveLength(1);
  });
});

describe("filterByTag", () => {
  it("filters by tag", () => {
    const execs = [
      makeExec({ executionId: "e1", tags: ["prod", "critical"] }),
      makeExec({ executionId: "e2", tags: ["dev"] }),
    ];
    expect(filterByTag(execs, "prod")).toHaveLength(1);
    expect(filterByTag(execs, "critical")).toHaveLength(1);
    expect(filterByTag(execs, "staging")).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// compareMetricWindows
// ─────────────────────────────────────────────────────────────────────────────

describe("compareMetricWindows", () => {
  it("computes positive deltas on improvement", () => {
    const prev = makeAggregated({ totalRuns: 10, successRate: 80, avgDurationMs: 2000, totalCostUsd: 1 });
    const curr = makeAggregated({ totalRuns: 20, successRate: 95, avgDurationMs: 1000, totalCostUsd: 2 });
    const delta = compareMetricWindows(prev, curr);
    expect(delta.runCountDelta).toBe(10);
    expect(delta.successRateDelta).toBe(15);
    expect(delta.avgDurationDelta).toBe(-1000);
    expect(delta.costDelta).toBe(1);
  });

  it("handles equal windows", () => {
    const m = makeAggregated();
    const delta = compareMetricWindows(m, m);
    expect(delta.runCountDelta).toBe(0);
    expect(delta.successRateDelta).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// summarizeFleetMetrics
// ─────────────────────────────────────────────────────────────────────────────

describe("summarizeFleetMetrics", () => {
  it("handles empty fleet", () => {
    const summary = summarizeFleetMetrics([]);
    expect(summary.totalWorkflows).toBe(0);
    expect(summary.totalRuns).toBe(0);
    expect(summary.overallSuccessRate).toBe(0);
  });

  it("totals runs and cost", () => {
    const wfs = [
      makeAggregated({ workflowId: "wf1", totalRuns: 10, successCount: 10, failureCount: 0, totalCostUsd: 1 }),
      makeAggregated({ workflowId: "wf2", totalRuns: 20, successCount: 15, failureCount: 5, totalCostUsd: 2 }),
    ];
    const summary = summarizeFleetMetrics(wfs);
    expect(summary.totalRuns).toBe(30);
    expect(summary.totalCostUsd).toBe(3);
    expect(summary.overallSuccessRate).toBeCloseTo(83.3, 0);
  });

  it("identifies top costly workflows (sorted by cost)", () => {
    const wfs = [
      makeAggregated({ workflowId: "wf1", totalCostUsd: 1 }),
      makeAggregated({ workflowId: "wf2", totalCostUsd: 10 }),
      makeAggregated({ workflowId: "wf3", totalCostUsd: 5 }),
    ];
    const summary = summarizeFleetMetrics(wfs);
    expect(summary.topCostlyWorkflows[0].workflowId).toBe("wf2");
    expect(summary.topCostlyWorkflows[1].workflowId).toBe("wf3");
  });

  it("identifies top failing workflows", () => {
    const wfs = [
      makeAggregated({ workflowId: "wf1", failureRate: 10 }),
      makeAggregated({ workflowId: "wf2", failureRate: 50 }),
      makeAggregated({ workflowId: "wf3", failureRate: 5 }),
    ];
    const summary = summarizeFleetMetrics(wfs);
    expect(summary.topFailingWorkflows[0].workflowId).toBe("wf2");
  });
});
