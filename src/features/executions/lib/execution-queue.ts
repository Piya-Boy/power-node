/**
 * Execution queue and scheduling utilities.
 * Manages workflow execution priorities and deduplication.
 */

export type ExecutionPriority = "low" | "normal" | "high" | "critical";

export interface QueuedExecution {
  id: string;
  workflowId: string;
  priority: ExecutionPriority;
  scheduledAt: Date;
  payload?: Record<string, unknown>;
  retryCount: number;
  maxRetries: number;
  tags: string[];
}

export interface QueueStats {
  total: number;
  byPriority: Record<ExecutionPriority, number>;
  overdue: number;
  readyToRun: number;
}

const PRIORITY_ORDER: Record<ExecutionPriority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

/**
 * Sort queued executions by priority then scheduled time.
 */
export function sortQueue(executions: QueuedExecution[]): QueuedExecution[] {
  return [...executions].sort((a, b) => {
    const priorityDiff = PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return a.scheduledAt.getTime() - b.scheduledAt.getTime();
  });
}

/**
 * Get executions that are ready to run (scheduled time has passed).
 */
export function getReadyExecutions(
  executions: QueuedExecution[],
  now: Date = new Date(),
): QueuedExecution[] {
  return sortQueue(
    executions.filter((e) => e.scheduledAt.getTime() <= now.getTime()),
  );
}

/**
 * Get overdue executions (past scheduled time by more than a threshold).
 */
export function getOverdueExecutions(
  executions: QueuedExecution[],
  thresholdMs: number = 60_000,
  now: Date = new Date(),
): QueuedExecution[] {
  return executions.filter(
    (e) => now.getTime() - e.scheduledAt.getTime() > thresholdMs,
  );
}

/**
 * Deduplicate executions with same workflowId in queue (keep highest priority).
 */
export function deduplicateQueue(executions: QueuedExecution[]): QueuedExecution[] {
  const byWorkflow = new Map<string, QueuedExecution>();

  for (const execution of executions) {
    const existing = byWorkflow.get(execution.workflowId);
    if (
      !existing ||
      PRIORITY_ORDER[execution.priority] > PRIORITY_ORDER[existing.priority] ||
      (execution.priority === existing.priority &&
        execution.scheduledAt.getTime() < existing.scheduledAt.getTime())
    ) {
      byWorkflow.set(execution.workflowId, execution);
    }
  }

  return Array.from(byWorkflow.values());
}

/**
 * Calculate queue statistics.
 */
export function getQueueStats(
  executions: QueuedExecution[],
  now: Date = new Date(),
): QueueStats {
  const byPriority: Record<ExecutionPriority, number> = {
    low: 0,
    normal: 0,
    high: 0,
    critical: 0,
  };

  for (const e of executions) {
    byPriority[e.priority]++;
  }

  return {
    total: executions.length,
    byPriority,
    overdue: getOverdueExecutions(executions, 60_000, now).length,
    readyToRun: getReadyExecutions(executions, now).length,
  };
}

/**
 * Check if an execution can be retried.
 */
export function canRetry(execution: QueuedExecution): boolean {
  return execution.retryCount < execution.maxRetries;
}

/**
 * Create a retry execution (incremented retry count, delayed schedule).
 */
export function createRetry(
  execution: QueuedExecution,
  delayMs: number = 5000,
): QueuedExecution | null {
  if (!canRetry(execution)) return null;

  return {
    ...execution,
    id: `${execution.id}_retry${execution.retryCount + 1}`,
    retryCount: execution.retryCount + 1,
    scheduledAt: new Date(Date.now() + delayMs),
  };
}
