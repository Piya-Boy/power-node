/**
 * Phase 44 — Workflow Analytics & Insights Dashboard
 * Pure utilities for computing workflow performance analytics,
 * trend analysis, bottleneck detection, and savings estimation.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type TimeGranularity = "hour" | "day" | "week" | "month";

export type TrendDirection = "up" | "down" | "stable";

export interface ExecutionDataPoint {
  workflowId: string;
  workflowName: string;
  executedAt: Date;
  durationMs: number;
  status: "success" | "failed" | "cancelled";
  triggeredBy: "manual" | "schedule" | "webhook" | "api";
  nodeCount: number;
  aiTokensUsed?: number;
  cost?: number;
}

export interface WorkflowInsights {
  workflowId: string;
  workflowName: string;
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  successRate: number;           // 0-100
  avgDurationMs: number;
  medianDurationMs: number;
  p95DurationMs: number;
  totalCost: number;
  lastExecutedAt?: Date;
  trend: TrendDirection;
  topFailureRate: boolean;       // in top 20% by failure rate
}

export interface TimeSeriesPoint {
  timestamp: Date;
  value: number;
  label?: string;
}

export interface TimeSeries {
  name: string;
  granularity: TimeGranularity;
  points: TimeSeriesPoint[];
}

export interface DashboardMetrics {
  period: { start: Date; end: Date };
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  overallSuccessRate: number;
  totalDurationMs: number;
  avgDurationMs: number;
  totalCost: number;
  mostUsedTrigger: string;
  uniqueWorkflows: number;
  activeWorkflows: number;       // executed at least once in period
}

export interface BottleneckAnalysis {
  workflowId: string;
  workflowName: string;
  type: "slow_execution" | "high_failure" | "high_cost" | "timeout";
  severity: "low" | "medium" | "high" | "critical";
  value: number;
  threshold: number;
  recommendation: string;
}

export interface SavingsEstimate {
  workflowId: string;
  workflowName: string;
  executionsPerMonth: number;
  avgManualTimeMinutes: number;   // estimated time if done manually
  automatedTimeMinutes: number;   // actual execution time
  timeSavedPerMonth: number;      // minutes saved per month
  costPerHour: number;            // team hourly rate
  monthlySavingsUsd: number;
  annualSavingsUsd: number;
}

export interface TrendAnalysis {
  metric: string;
  currentPeriodValue: number;
  previousPeriodValue: number;
  changePercent: number;
  direction: TrendDirection;
  isSignificant: boolean;        // change > 10%
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Analytics
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute per-workflow insights from execution data.
 */
export function computeWorkflowInsights(
  executions: ExecutionDataPoint[],
  workflowId: string
): WorkflowInsights | null {
  const wfExecs = executions.filter((e) => e.workflowId === workflowId);
  if (wfExecs.length === 0) return null;

  const successCount = wfExecs.filter((e) => e.status === "success").length;
  const failureCount = wfExecs.filter((e) => e.status === "failed").length;
  const successRate = Math.round((successCount / wfExecs.length) * 100);

  const durations = wfExecs.map((e) => e.durationMs).sort((a, b) => a - b);
  const avgDurationMs = Math.round(durations.reduce((s, d) => s + d, 0) / durations.length);
  const medianDurationMs = durations[Math.floor(durations.length / 2)];
  const p95DurationMs = durations[Math.floor(durations.length * 0.95)];

  const totalCost = wfExecs.reduce((s, e) => s + (e.cost ?? 0), 0);
  const sortedByDate = [...wfExecs].sort(
    (a, b) => b.executedAt.getTime() - a.executedAt.getTime()
  );
  const lastExecutedAt = sortedByDate[0]?.executedAt;

  // Trend: compare first half vs second half success rate
  const half = Math.floor(wfExecs.length / 2);
  const firstHalf = wfExecs.slice(0, half);
  const secondHalf = wfExecs.slice(half);
  const firstSuccessRate = firstHalf.length > 0
    ? firstHalf.filter((e) => e.status === "success").length / firstHalf.length
    : 0;
  const secondSuccessRate = secondHalf.length > 0
    ? secondHalf.filter((e) => e.status === "success").length / secondHalf.length
    : 0;

  let trend: TrendDirection = "stable";
  if (secondSuccessRate > firstSuccessRate + 0.05) trend = "up";
  else if (secondSuccessRate < firstSuccessRate - 0.05) trend = "down";

  return {
    workflowId,
    workflowName: wfExecs[0].workflowName,
    totalExecutions: wfExecs.length,
    successCount,
    failureCount,
    successRate,
    avgDurationMs,
    medianDurationMs,
    p95DurationMs,
    totalCost: Math.round(totalCost * 100) / 100,
    lastExecutedAt,
    trend,
    topFailureRate: false, // set by computeAllInsights
  };
}

/**
 * Compute insights for all workflows and mark top failure rates.
 */
export function computeAllInsights(executions: ExecutionDataPoint[]): WorkflowInsights[] {
  const workflowIds = [...new Set(executions.map((e) => e.workflowId))];
  const allInsights = workflowIds
    .map((id) => computeWorkflowInsights(executions, id))
    .filter((i): i is WorkflowInsights => i !== null);

  // Mark top 20% by failure rate
  const sorted = [...allInsights].sort((a, b) => b.successRate - a.successRate);
  const threshold20 = Math.floor(sorted.length * 0.2);
  const top20FailureIds = new Set(
    sorted.slice(sorted.length - threshold20).map((i) => i.workflowId)
  );

  return allInsights.map((i) => ({
    ...i,
    topFailureRate: top20FailureIds.has(i.workflowId),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Time Series
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a time series of execution counts bucketed by granularity.
 */
export function buildExecutionTimeSeries(
  executions: ExecutionDataPoint[],
  granularity: TimeGranularity,
  start: Date,
  end: Date
): TimeSeries {
  const buckets = generateTimeBuckets(start, end, granularity);
  const points: TimeSeriesPoint[] = buckets.map((bucketStart) => {
    const bucketEnd = getNextBucket(bucketStart, granularity);
    const count = executions.filter(
      (e) => e.executedAt >= bucketStart && e.executedAt < bucketEnd
    ).length;
    return { timestamp: bucketStart, value: count };
  });

  return { name: "executions", granularity, points };
}

/**
 * Build a time series of success rates bucketed by granularity.
 */
export function buildSuccessRateTimeSeries(
  executions: ExecutionDataPoint[],
  granularity: TimeGranularity,
  start: Date,
  end: Date
): TimeSeries {
  const buckets = generateTimeBuckets(start, end, granularity);
  const points: TimeSeriesPoint[] = buckets.map((bucketStart) => {
    const bucketEnd = getNextBucket(bucketStart, granularity);
    const bucket = executions.filter(
      (e) => e.executedAt >= bucketStart && e.executedAt < bucketEnd
    );
    const successRate = bucket.length > 0
      ? Math.round((bucket.filter((e) => e.status === "success").length / bucket.length) * 100)
      : 0;
    return { timestamp: bucketStart, value: successRate };
  });

  return { name: "success_rate", granularity, points };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Metrics
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute high-level dashboard metrics for a time period.
 */
export function computeDashboardMetrics(
  executions: ExecutionDataPoint[],
  period: { start: Date; end: Date }
): DashboardMetrics {
  const periodExecs = executions.filter(
    (e) => e.executedAt >= period.start && e.executedAt <= period.end
  );

  const successfulExecutions = periodExecs.filter((e) => e.status === "success").length;
  const failedExecutions = periodExecs.filter((e) => e.status === "failed").length;
  const overallSuccessRate = periodExecs.length > 0
    ? Math.round((successfulExecutions / periodExecs.length) * 100)
    : 0;
  const totalDurationMs = periodExecs.reduce((s, e) => s + e.durationMs, 0);
  const avgDurationMs = periodExecs.length > 0
    ? Math.round(totalDurationMs / periodExecs.length)
    : 0;
  const totalCost = Math.round(periodExecs.reduce((s, e) => s + (e.cost ?? 0), 0) * 100) / 100;

  // Most used trigger
  const triggerCounts = periodExecs.reduce<Record<string, number>>((acc, e) => {
    acc[e.triggeredBy] = (acc[e.triggeredBy] ?? 0) + 1;
    return acc;
  }, {});
  const mostUsedTrigger = Object.entries(triggerCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "none";

  const uniqueWorkflows = new Set(periodExecs.map((e) => e.workflowId)).size;
  const activeWorkflows = uniqueWorkflows;

  return {
    period,
    totalExecutions: periodExecs.length,
    successfulExecutions,
    failedExecutions,
    overallSuccessRate,
    totalDurationMs,
    avgDurationMs,
    totalCost,
    mostUsedTrigger,
    uniqueWorkflows,
    activeWorkflows,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bottleneck Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect workflow bottlenecks based on configurable thresholds.
 */
export function detectBottlenecks(
  insights: WorkflowInsights[],
  thresholds = {
    slowExecutionMs: 30_000,
    highFailureRatePercent: 20,
    highCostUsd: 10,
    timeoutMs: 60_000,
  }
): BottleneckAnalysis[] {
  const analyses: BottleneckAnalysis[] = [];

  for (const insight of insights) {
    // Slow execution
    if (insight.avgDurationMs > thresholds.slowExecutionMs) {
      analyses.push({
        workflowId: insight.workflowId,
        workflowName: insight.workflowName,
        type: "slow_execution",
        severity: insight.avgDurationMs > thresholds.slowExecutionMs * 3 ? "critical"
          : insight.avgDurationMs > thresholds.slowExecutionMs * 2 ? "high" : "medium",
        value: insight.avgDurationMs,
        threshold: thresholds.slowExecutionMs,
        recommendation: "Consider splitting into sub-workflows or adding caching",
      });
    }

    // High failure rate
    const failureRate = 100 - insight.successRate;
    if (failureRate > thresholds.highFailureRatePercent) {
      analyses.push({
        workflowId: insight.workflowId,
        workflowName: insight.workflowName,
        type: "high_failure",
        severity: failureRate > 60 ? "critical" : failureRate > 40 ? "high" : "medium",
        value: failureRate,
        threshold: thresholds.highFailureRatePercent,
        recommendation: "Review error handling and add retry logic",
      });
    }

    // High cost
    const costPerExecution = insight.totalExecutions > 0
      ? insight.totalCost / insight.totalExecutions
      : 0;
    if (costPerExecution > thresholds.highCostUsd) {
      analyses.push({
        workflowId: insight.workflowId,
        workflowName: insight.workflowName,
        type: "high_cost",
        severity: costPerExecution > thresholds.highCostUsd * 5 ? "critical" : "medium",
        value: costPerExecution,
        threshold: thresholds.highCostUsd,
        recommendation: "Optimize AI token usage or switch to a cheaper model",
      });
    }

    // Timeout risk (p95 > threshold)
    if (insight.p95DurationMs > thresholds.timeoutMs) {
      analyses.push({
        workflowId: insight.workflowId,
        workflowName: insight.workflowName,
        type: "timeout",
        severity: "high",
        value: insight.p95DurationMs,
        threshold: thresholds.timeoutMs,
        recommendation: "Increase timeout limit or optimize slow nodes",
      });
    }
  }

  return analyses.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Savings Estimation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estimate time and cost savings from workflow automation.
 */
export function estimateSavings(params: {
  workflowId: string;
  workflowName: string;
  executionsPerMonth: number;
  avgManualTimeMinutes: number;
  avgExecutionMs: number;
  costPerHour?: number;          // team hourly rate, default $50
}): SavingsEstimate {
  const {
    workflowId, workflowName, executionsPerMonth,
    avgManualTimeMinutes, avgExecutionMs, costPerHour = 50,
  } = params;

  const automatedTimeMinutes = avgExecutionMs / 60_000;
  const timeSavedPerExecution = avgManualTimeMinutes - automatedTimeMinutes;
  const timeSavedPerMonth = timeSavedPerExecution * executionsPerMonth;

  const monthlySavingsUsd = (timeSavedPerMonth / 60) * costPerHour;
  const annualSavingsUsd = monthlySavingsUsd * 12;

  return {
    workflowId,
    workflowName,
    executionsPerMonth,
    avgManualTimeMinutes,
    automatedTimeMinutes: Math.round(automatedTimeMinutes * 100) / 100,
    timeSavedPerMonth: Math.round(timeSavedPerMonth),
    costPerHour,
    monthlySavingsUsd: Math.round(monthlySavingsUsd * 100) / 100,
    annualSavingsUsd: Math.round(annualSavingsUsd * 100) / 100,
  };
}

/**
 * Aggregate total savings across multiple workflows.
 */
export function aggregateSavings(
  estimates: SavingsEstimate[]
): { totalTimeSavedPerMonth: number; totalMonthlySavingsUsd: number; totalAnnualSavingsUsd: number } {
  return {
    totalTimeSavedPerMonth: estimates.reduce((s, e) => s + e.timeSavedPerMonth, 0),
    totalMonthlySavingsUsd: Math.round(
      estimates.reduce((s, e) => s + e.monthlySavingsUsd, 0) * 100
    ) / 100,
    totalAnnualSavingsUsd: Math.round(
      estimates.reduce((s, e) => s + e.annualSavingsUsd, 0) * 100
    ) / 100,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Trend Analysis
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute trend analysis comparing two time periods.
 */
export function computeTrend(
  currentValue: number,
  previousValue: number,
  metricName: string
): TrendAnalysis {
  const changePercent = previousValue !== 0
    ? Math.round(((currentValue - previousValue) / previousValue) * 100)
    : currentValue > 0 ? 100 : 0;

  let direction: TrendDirection = "stable";
  if (changePercent > 5) direction = "up";
  else if (changePercent < -5) direction = "down";

  return {
    metric: metricName,
    currentPeriodValue: currentValue,
    previousPeriodValue: previousValue,
    changePercent,
    direction,
    isSignificant: Math.abs(changePercent) > 10,
  };
}

/**
 * Compare execution metrics between two periods.
 */
export function comparePeriods(
  currentPeriod: DashboardMetrics,
  previousPeriod: DashboardMetrics
): TrendAnalysis[] {
  return [
    computeTrend(currentPeriod.totalExecutions, previousPeriod.totalExecutions, "total_executions"),
    computeTrend(currentPeriod.overallSuccessRate, previousPeriod.overallSuccessRate, "success_rate"),
    computeTrend(currentPeriod.avgDurationMs, previousPeriod.avgDurationMs, "avg_duration_ms"),
    computeTrend(currentPeriod.totalCost, previousPeriod.totalCost, "total_cost"),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function generateTimeBuckets(start: Date, end: Date, granularity: TimeGranularity): Date[] {
  const buckets: Date[] = [];
  let current = new Date(start);

  while (current < end) {
    buckets.push(new Date(current));
    current = getNextBucket(current, granularity);
  }

  return buckets;
}

function getNextBucket(date: Date, granularity: TimeGranularity): Date {
  const d = new Date(date);
  switch (granularity) {
    case "hour":
      d.setHours(d.getHours() + 1);
      break;
    case "day":
      d.setDate(d.getDate() + 1);
      break;
    case "week":
      d.setDate(d.getDate() + 7);
      break;
    case "month":
      d.setMonth(d.getMonth() + 1);
      break;
  }
  return d;
}
