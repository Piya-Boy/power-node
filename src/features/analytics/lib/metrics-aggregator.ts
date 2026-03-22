/**
 * Phase 69 — Workflow Metrics Aggregator
 * Pure utilities for aggregating execution metrics, computing
 * percentiles, bucketing time series, and generating trend summaries.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type MetricName =
  | "duration_ms"
  | "success_rate"
  | "failure_rate"
  | "run_count"
  | "cost_usd"
  | "retry_count"
  | "queue_wait_ms";

export type BucketGranularity = "minute" | "hour" | "day" | "week" | "month";

export interface ExecutionRecord {
  executionId: string;
  workflowId: string;
  nodeId?: string;
  startedAt: Date;
  endedAt: Date;
  success: boolean;
  durationMs: number;
  retryCount: number;
  costUsd: number;
  queueWaitMs: number;
  tags: string[];
}

export interface MetricBucket {
  bucketKey: string;      // ISO-string key (e.g. "2025-06-01T00:00:00.000Z")
  startAt: Date;
  endAt: Date;
  count: number;
  successCount: number;
  failureCount: number;
  totalDurationMs: number;
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  totalCostUsd: number;
  avgCostUsd: number;
  totalRetries: number;
  avgQueueWaitMs: number;
}

export interface AggregatedMetrics {
  workflowId: string;
  windowStart: Date;
  windowEnd: Date;
  totalRuns: number;
  successCount: number;
  failureCount: number;
  successRate: number;      // 0–100
  failureRate: number;
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  maxDurationMs: number;
  minDurationMs: number;
  totalCostUsd: number;
  avgCostUsd: number;
  totalRetries: number;
  avgRetries: number;
  avgQueueWaitMs: number;
}

export interface TrendPoint {
  timestamp: Date;
  value: number;
}

export interface MetricTrend {
  metric: MetricName;
  points: TrendPoint[];
  direction: "up" | "down" | "flat";
  changePercent: number;    // % change from first to last point
}

// ─────────────────────────────────────────────────────────────────────────────
// Percentile Computation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute a percentile value from a sorted array of numbers.
 * Uses nearest-rank method (1-based).
 */
export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  if (p <= 0) return sortedValues[0];
  if (p >= 100) return sortedValues[sortedValues.length - 1];
  const index = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
}

/**
 * Sort a numeric array in ascending order (non-mutating).
 */
export function sortAsc(values: number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

// ─────────────────────────────────────────────────────────────────────────────
// Bucket Key Generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Truncate a Date to the start of its bucket granularity (UTC).
 */
export function truncateToGranularity(date: Date, granularity: BucketGranularity): Date {
  const d = new Date(date);
  switch (granularity) {
    case "minute":
      d.setUTCSeconds(0, 0);
      break;
    case "hour":
      d.setUTCMinutes(0, 0, 0);
      break;
    case "day":
      d.setUTCHours(0, 0, 0, 0);
      break;
    case "week": {
      const dayOfWeek = d.getUTCDay(); // 0=Sun
      d.setUTCDate(d.getUTCDate() - dayOfWeek);
      d.setUTCHours(0, 0, 0, 0);
      break;
    }
    case "month":
      d.setUTCDate(1);
      d.setUTCHours(0, 0, 0, 0);
      break;
  }
  return d;
}

/**
 * Get bucket end time (exclusive) given start and granularity.
 */
export function getBucketEnd(start: Date, granularity: BucketGranularity): Date {
  const d = new Date(start);
  switch (granularity) {
    case "minute":
      d.setUTCMinutes(d.getUTCMinutes() + 1);
      break;
    case "hour":
      d.setUTCHours(d.getUTCHours() + 1);
      break;
    case "day":
      d.setUTCDate(d.getUTCDate() + 1);
      break;
    case "week":
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case "month":
      d.setUTCMonth(d.getUTCMonth() + 1);
      break;
  }
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aggregate executions into time-bucketed metrics.
 */
export function bucketExecutions(
  executions: ExecutionRecord[],
  granularity: BucketGranularity
): MetricBucket[] {
  const bucketMap = new Map<string, ExecutionRecord[]>();

  for (const exec of executions) {
    const bucketStart = truncateToGranularity(exec.startedAt, granularity);
    const key = bucketStart.toISOString();
    if (!bucketMap.has(key)) bucketMap.set(key, []);
    bucketMap.get(key)!.push(exec);
  }

  const buckets: MetricBucket[] = [];
  for (const [key, recs] of bucketMap.entries()) {
    const startAt = new Date(key);
    buckets.push(buildBucket(key, startAt, granularity, recs));
  }

  return buckets.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

function buildBucket(
  key: string,
  startAt: Date,
  granularity: BucketGranularity,
  recs: ExecutionRecord[]
): MetricBucket {
  const endAt = getBucketEnd(startAt, granularity);
  const count = recs.length;
  const successCount = recs.filter((r) => r.success).length;
  const failureCount = count - successCount;
  const durations = sortAsc(recs.map((r) => r.durationMs));
  const totalDurationMs = durations.reduce((s, v) => s + v, 0);
  const avgDurationMs = count > 0 ? Math.round(totalDurationMs / count) : 0;
  const totalCostUsd = recs.reduce((s, r) => s + r.costUsd, 0);
  const avgCostUsd = count > 0 ? totalCostUsd / count : 0;
  const totalRetries = recs.reduce((s, r) => s + r.retryCount, 0);
  const avgQueueWaitMs = count > 0
    ? Math.round(recs.reduce((s, r) => s + r.queueWaitMs, 0) / count)
    : 0;

  return {
    bucketKey: key,
    startAt,
    endAt,
    count,
    successCount,
    failureCount,
    totalDurationMs,
    avgDurationMs,
    p50DurationMs: percentile(durations, 50),
    p95DurationMs: percentile(durations, 95),
    p99DurationMs: percentile(durations, 99),
    totalCostUsd,
    avgCostUsd,
    totalRetries,
    avgQueueWaitMs,
  };
}

/**
 * Aggregate all executions in a window into a single summary.
 */
export function aggregateExecutions(
  workflowId: string,
  executions: ExecutionRecord[],
  windowStart: Date,
  windowEnd: Date
): AggregatedMetrics {
  const inWindow = executions.filter(
    (e) => e.startedAt >= windowStart && e.startedAt < windowEnd
  );

  const totalRuns = inWindow.length;
  const successCount = inWindow.filter((e) => e.success).length;
  const failureCount = totalRuns - successCount;
  const successRate = totalRuns > 0 ? (successCount / totalRuns) * 100 : 0;
  const failureRate = 100 - successRate;

  const durations = sortAsc(inWindow.map((e) => e.durationMs));
  const totalDurationMs = durations.reduce((s, v) => s + v, 0);
  const avgDurationMs = totalRuns > 0 ? Math.round(totalDurationMs / totalRuns) : 0;
  const totalCostUsd = inWindow.reduce((s, e) => s + e.costUsd, 0);
  const avgCostUsd = totalRuns > 0 ? totalCostUsd / totalRuns : 0;
  const totalRetries = inWindow.reduce((s, e) => s + e.retryCount, 0);
  const avgRetries = totalRuns > 0 ? totalRetries / totalRuns : 0;
  const avgQueueWaitMs = totalRuns > 0
    ? Math.round(inWindow.reduce((s, e) => s + e.queueWaitMs, 0) / totalRuns)
    : 0;

  return {
    workflowId,
    windowStart,
    windowEnd,
    totalRuns,
    successCount,
    failureCount,
    successRate: Math.round(successRate * 10) / 10,
    failureRate: Math.round(failureRate * 10) / 10,
    avgDurationMs,
    p50DurationMs: percentile(durations, 50),
    p95DurationMs: percentile(durations, 95),
    p99DurationMs: percentile(durations, 99),
    maxDurationMs: durations.length > 0 ? durations[durations.length - 1] : 0,
    minDurationMs: durations.length > 0 ? durations[0] : 0,
    totalCostUsd,
    avgCostUsd,
    totalRetries,
    avgRetries: Math.round(avgRetries * 10) / 10,
    avgQueueWaitMs,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Trend Analysis
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract a trend series from buckets for a given metric.
 */
export function extractTrend(
  buckets: MetricBucket[],
  metric: MetricName
): MetricTrend {
  const points: TrendPoint[] = buckets.map((b) => ({
    timestamp: b.startAt,
    value: getMetricValue(b, metric),
  }));

  let direction: "up" | "down" | "flat" = "flat";
  let changePercent = 0;

  if (points.length >= 2) {
    const first = points[0].value;
    const last = points[points.length - 1].value;
    if (first !== 0) {
      changePercent = Math.round(((last - first) / first) * 1000) / 10;
    } else if (last > 0) {
      changePercent = 100;
    }
    if (changePercent > 5) direction = "up";
    else if (changePercent < -5) direction = "down";
  }

  return { metric, points, direction, changePercent };
}

function getMetricValue(bucket: MetricBucket, metric: MetricName): number {
  switch (metric) {
    case "duration_ms": return bucket.avgDurationMs;
    case "success_rate": return bucket.count > 0 ? (bucket.successCount / bucket.count) * 100 : 0;
    case "failure_rate": return bucket.count > 0 ? (bucket.failureCount / bucket.count) * 100 : 0;
    case "run_count": return bucket.count;
    case "cost_usd": return bucket.totalCostUsd;
    case "retry_count": return bucket.totalRetries;
    case "queue_wait_ms": return bucket.avgQueueWaitMs;
    default: return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Filter execution records to a time window.
 */
export function filterToWindow(
  executions: ExecutionRecord[],
  start: Date,
  end: Date
): ExecutionRecord[] {
  return executions.filter((e) => e.startedAt >= start && e.startedAt < end);
}

/**
 * Filter executions by workflow ID.
 */
export function filterByWorkflow(
  executions: ExecutionRecord[],
  workflowId: string
): ExecutionRecord[] {
  return executions.filter((e) => e.workflowId === workflowId);
}

/**
 * Filter executions by tag.
 */
export function filterByTag(executions: ExecutionRecord[], tag: string): ExecutionRecord[] {
  return executions.filter((e) => e.tags.includes(tag));
}

// ─────────────────────────────────────────────────────────────────────────────
// Comparison
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compare two aggregated metric windows — returns deltas.
 */
export function compareMetricWindows(
  prev: AggregatedMetrics,
  curr: AggregatedMetrics
): {
  runCountDelta: number;
  successRateDelta: number;
  avgDurationDelta: number;
  costDelta: number;
  p95DurationDelta: number;
} {
  return {
    runCountDelta: curr.totalRuns - prev.totalRuns,
    successRateDelta: Math.round((curr.successRate - prev.successRate) * 10) / 10,
    avgDurationDelta: curr.avgDurationMs - prev.avgDurationMs,
    costDelta: Math.round((curr.totalCostUsd - prev.totalCostUsd) * 100) / 100,
    p95DurationDelta: curr.p95DurationMs - prev.p95DurationMs,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-Workflow Fleet Summary
// ─────────────────────────────────────────────────────────────────────────────

export interface FleetMetricsSummary {
  totalWorkflows: number;
  totalRuns: number;
  overallSuccessRate: number;
  totalCostUsd: number;
  avgDurationMs: number;
  p95DurationMs: number;
  topCostlyWorkflows: Array<{ workflowId: string; totalCostUsd: number }>;
  topSlowWorkflows: Array<{ workflowId: string; p95DurationMs: number }>;
  topFailingWorkflows: Array<{ workflowId: string; failureRate: number }>;
}

/**
 * Summarize metrics across multiple workflows.
 */
export function summarizeFleetMetrics(
  metricsPerWorkflow: AggregatedMetrics[]
): FleetMetricsSummary {
  if (metricsPerWorkflow.length === 0) {
    return {
      totalWorkflows: 0,
      totalRuns: 0,
      overallSuccessRate: 0,
      totalCostUsd: 0,
      avgDurationMs: 0,
      p95DurationMs: 0,
      topCostlyWorkflows: [],
      topSlowWorkflows: [],
      topFailingWorkflows: [],
    };
  }

  const totalRuns = metricsPerWorkflow.reduce((s, m) => s + m.totalRuns, 0);
  const totalSuccess = metricsPerWorkflow.reduce((s, m) => s + m.successCount, 0);
  const overallSuccessRate = totalRuns > 0 ? Math.round((totalSuccess / totalRuns) * 1000) / 10 : 0;
  const totalCostUsd = metricsPerWorkflow.reduce((s, m) => s + m.totalCostUsd, 0);
  const avgDurationMs = totalRuns > 0
    ? Math.round(metricsPerWorkflow.reduce((s, m) => s + m.avgDurationMs * m.totalRuns, 0) / totalRuns)
    : 0;

  const allP95 = sortAsc(metricsPerWorkflow.map((m) => m.p95DurationMs));
  const p95DurationMs = percentile(allP95, 95);

  const topCostlyWorkflows = [...metricsPerWorkflow]
    .sort((a, b) => b.totalCostUsd - a.totalCostUsd)
    .slice(0, 5)
    .map((m) => ({ workflowId: m.workflowId, totalCostUsd: m.totalCostUsd }));

  const topSlowWorkflows = [...metricsPerWorkflow]
    .sort((a, b) => b.p95DurationMs - a.p95DurationMs)
    .slice(0, 5)
    .map((m) => ({ workflowId: m.workflowId, p95DurationMs: m.p95DurationMs }));

  const topFailingWorkflows = [...metricsPerWorkflow]
    .filter((m) => m.totalRuns > 0)
    .sort((a, b) => b.failureRate - a.failureRate)
    .slice(0, 5)
    .map((m) => ({ workflowId: m.workflowId, failureRate: m.failureRate }));

  return {
    totalWorkflows: metricsPerWorkflow.length,
    totalRuns,
    overallSuccessRate,
    totalCostUsd,
    avgDurationMs,
    p95DurationMs,
    topCostlyWorkflows,
    topSlowWorkflows,
    topFailingWorkflows,
  };
}
