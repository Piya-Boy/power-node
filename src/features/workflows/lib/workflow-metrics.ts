/**
 * Workflow metrics and analytics utilities.
 * Computes performance statistics from execution history.
 */

export interface ExecutionRecord {
  id: string;
  workflowId: string;
  status: "SUCCESS" | "FAILED" | "RUNNING";
  startedAt: Date;
  completedAt?: Date | null;
  nodeCount?: number;
}

export interface WorkflowMetrics {
  workflowId: string;
  totalRuns: number;
  successCount: number;
  failureCount: number;
  runningCount: number;
  successRate: number; // 0-100
  avgDurationMs: number | null;
  minDurationMs: number | null;
  maxDurationMs: number | null;
  p50DurationMs: number | null;
  p95DurationMs: number | null;
  lastRunAt: Date | null;
  lastStatus: "SUCCESS" | "FAILED" | "RUNNING" | null;
}

export interface TimeSeriesPoint {
  date: string; // YYYY-MM-DD
  runs: number;
  successes: number;
  failures: number;
  avgDurationMs: number | null;
}

function getDurationMs(record: ExecutionRecord): number | null {
  if (!record.completedAt) return null;
  return record.completedAt.getTime() - record.startedAt.getTime();
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

export function computeWorkflowMetrics(
  workflowId: string,
  records: ExecutionRecord[],
): WorkflowMetrics {
  const wfRecords = records.filter((r) => r.workflowId === workflowId);

  if (wfRecords.length === 0) {
    return {
      workflowId,
      totalRuns: 0,
      successCount: 0,
      failureCount: 0,
      runningCount: 0,
      successRate: 0,
      avgDurationMs: null,
      minDurationMs: null,
      maxDurationMs: null,
      p50DurationMs: null,
      p95DurationMs: null,
      lastRunAt: null,
      lastStatus: null,
    };
  }

  const successCount = wfRecords.filter((r) => r.status === "SUCCESS").length;
  const failureCount = wfRecords.filter((r) => r.status === "FAILED").length;
  const runningCount = wfRecords.filter((r) => r.status === "RUNNING").length;
  const completed = successCount + failureCount;
  const successRate = completed > 0 ? Math.round((successCount / completed) * 100) : 0;

  const durations = wfRecords
    .map(getDurationMs)
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b);

  const avgDurationMs =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;

  const sortedByStart = [...wfRecords].sort(
    (a, b) => b.startedAt.getTime() - a.startedAt.getTime(),
  );
  const lastRecord = sortedByStart[0];

  return {
    workflowId,
    totalRuns: wfRecords.length,
    successCount,
    failureCount,
    runningCount,
    successRate,
    avgDurationMs,
    minDurationMs: durations.length > 0 ? durations[0] : null,
    maxDurationMs: durations.length > 0 ? durations[durations.length - 1] : null,
    p50DurationMs: percentile(durations, 50),
    p95DurationMs: percentile(durations, 95),
    lastRunAt: lastRecord.startedAt,
    lastStatus: lastRecord.status,
  };
}

export function buildTimeSeries(
  records: ExecutionRecord[],
  days: number = 30,
): TimeSeriesPoint[] {
  const now = new Date();
  const points: TimeSeriesPoint[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().slice(0, 10);

    const dayRecords = records.filter(
      (r) => r.startedAt.toISOString().slice(0, 10) === dateStr,
    );

    const durations = dayRecords
      .map(getDurationMs)
      .filter((d): d is number => d !== null);

    points.push({
      date: dateStr,
      runs: dayRecords.length,
      successes: dayRecords.filter((r) => r.status === "SUCCESS").length,
      failures: dayRecords.filter((r) => r.status === "FAILED").length,
      avgDurationMs:
        durations.length > 0
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : null,
    });
  }

  return points;
}

export function getTopFailingWorkflows(
  records: ExecutionRecord[],
  limit: number = 5,
): Array<{ workflowId: string; failureCount: number; successRate: number }> {
  const workflowIds = [...new Set(records.map((r) => r.workflowId))];

  return workflowIds
    .map((wfId) => {
      const metrics = computeWorkflowMetrics(wfId, records);
      return {
        workflowId: wfId,
        failureCount: metrics.failureCount,
        successRate: metrics.successRate,
      };
    })
    .filter((w) => w.failureCount > 0)
    .sort((a, b) => b.failureCount - a.failureCount)
    .slice(0, limit);
}
