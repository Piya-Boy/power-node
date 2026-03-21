import type { ExecutionStatus } from "@/generated/prisma";

export interface ExecutionSummary {
  id: string;
  status: ExecutionStatus;
  duration: number | null; // milliseconds
  nodeCount: number;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

export function calculateDuration(
  startedAt: Date,
  completedAt?: Date | null,
): number | null {
  if (!completedAt) return null;
  return completedAt.getTime() - startedAt.getTime();
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "Running...";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

export function getStatusColor(status: ExecutionStatus): string {
  switch (status) {
    case "SUCCESS":
      return "text-green-500";
    case "FAILED":
      return "text-red-500";
    case "RUNNING":
      return "text-blue-500";
    default:
      return "text-gray-500";
  }
}

export function getStatusIcon(status: ExecutionStatus): string {
  switch (status) {
    case "SUCCESS":
      return "✓";
    case "FAILED":
      return "✗";
    case "RUNNING":
      return "⟳";
    default:
      return "?";
  }
}

export function summarizeExecutions(
  executions: {
    status: ExecutionStatus;
    startedAt: Date;
    completedAt?: Date | null;
  }[],
): {
  total: number;
  success: number;
  failed: number;
  running: number;
  avgDuration: number | null;
  successRate: number;
} {
  const total = executions.length;
  if (total === 0) {
    return { total: 0, success: 0, failed: 0, running: 0, avgDuration: null, successRate: 0 };
  }

  const success = executions.filter((e) => e.status === "SUCCESS").length;
  const failed = executions.filter((e) => e.status === "FAILED").length;
  const running = executions.filter((e) => e.status === "RUNNING").length;

  const durations = executions
    .map((e) => calculateDuration(e.startedAt, e.completedAt))
    .filter((d): d is number => d !== null);

  const avgDuration =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;

  const completedTotal = success + failed;
  const successRate = completedTotal > 0 ? Math.round((success / completedTotal) * 100) : 0;

  return { total, success, failed, running, avgDuration, successRate };
}
