// Phase 52 — Execution Queue Prioritization

export type ExecutionPriority = "critical" | "high" | "normal" | "low" | "background";
export type QueueStrategy = "fifo" | "priority" | "fair-share" | "weighted-round-robin";

export interface QueuedExecution {
  id: string;
  workflowId: string;
  workflowName: string;
  priority: ExecutionPriority;
  teamId: string;
  enqueuedAt: Date;
  scheduledAt?: Date;   // for delayed executions
  startedAt?: Date;
  completedAt?: Date;
  retryCount: number;
  maxRetries: number;
  estimatedDurationMs?: number;
  weight?: number;      // for weighted round-robin
  tags: string[];
}

export interface QueueConfig {
  strategy: QueueStrategy;
  maxQueueSize: number;
  maxConcurrent: number;
  teamQuota?: Record<string, number>;  // max concurrent per team
  priorityWeights?: Record<ExecutionPriority, number>;
}

export interface QueueStats {
  total: number;
  pending: number;
  running: number;
  byPriority: Record<ExecutionPriority, number>;
  byTeam: Record<string, number>;
  avgWaitTimeMs: number;
  estimatedDrainTimeMs: number;
}

// ─── Priority Scoring ────────────────────────────────────────────────────────

const PRIORITY_SCORE_MAP: Record<ExecutionPriority, number> = {
  critical: 5,
  high: 4,
  normal: 3,
  low: 2,
  background: 1,
};

/**
 * Returns a numeric score for an ExecutionPriority.
 * critical=5, high=4, normal=3, low=2, background=1
 */
export function priorityScore(priority: ExecutionPriority): number {
  return PRIORITY_SCORE_MAP[priority] ?? 1;
}

/**
 * Compare two queued executions for sorting.
 * Higher priority first; ties broken by earlier enqueue time.
 */
export function comparePriority(a: QueuedExecution, b: QueuedExecution): number {
  const scoreDiff = priorityScore(b.priority) - priorityScore(a.priority);
  if (scoreDiff !== 0) return scoreDiff;
  return a.enqueuedAt.getTime() - b.enqueuedAt.getTime();
}

// ─── Create ──────────────────────────────────────────────────────────────────

/**
 * Create a new QueuedExecution with sensible defaults.
 */
export function createQueuedExecution(params: {
  id: string;
  workflowId: string;
  workflowName: string;
  teamId: string;
  priority?: ExecutionPriority;
  enqueuedAt?: Date;
  scheduledAt?: Date;
  maxRetries?: number;
  estimatedDurationMs?: number;
  weight?: number;
  tags?: string[];
}): QueuedExecution {
  return {
    id: params.id,
    workflowId: params.workflowId,
    workflowName: params.workflowName,
    priority: params.priority ?? "normal",
    teamId: params.teamId,
    enqueuedAt: params.enqueuedAt ?? new Date(),
    scheduledAt: params.scheduledAt,
    retryCount: 0,
    maxRetries: params.maxRetries ?? 3,
    estimatedDurationMs: params.estimatedDurationMs,
    weight: params.weight,
    tags: params.tags ?? [],
  };
}

// ─── Sorting ─────────────────────────────────────────────────────────────────

/**
 * Sort a queue of executions by the given strategy.
 */
export function sortQueue(
  items: QueuedExecution[],
  strategy: QueueStrategy,
  config?: QueueConfig
): QueuedExecution[] {
  const arr = [...items];

  switch (strategy) {
    case "fifo":
      return arr.sort((a, b) => a.enqueuedAt.getTime() - b.enqueuedAt.getTime());

    case "priority":
      return arr.sort(comparePriority);

    case "fair-share": {
      const groups = buildFairShareGroups(arr);
      const teamIds = Object.keys(groups).sort();
      const result: QueuedExecution[] = [];
      let hasMore = true;
      while (hasMore) {
        hasMore = false;
        for (const teamId of teamIds) {
          const group = groups[teamId];
          if (group && group.length > 0) {
            // take one from each team per round (sorted by priority within team)
            group.sort(comparePriority);
            result.push(group.shift()!);
            if (group.length > 0) hasMore = true;
          }
        }
      }
      return result;
    }

    case "weighted-round-robin": {
      const groups = buildFairShareGroups(arr);
      const weights: Record<string, number> = {};
      for (const teamId of Object.keys(groups)) {
        weights[teamId] =
          (config?.priorityWeights
            ? Math.max(
                ...groups[teamId]!.map(
                  (e) => config.priorityWeights![e.priority] ?? priorityScore(e.priority)
                )
              )
            : 1);
      }
      return applyWeightedRoundRobin(groups, weights);
    }

    default:
      return arr;
  }
}

// ─── Capacity Checks ─────────────────────────────────────────────────────────

/**
 * Check whether a new item can be added to the queue.
 */
export function canEnqueue(
  queue: QueuedExecution[],
  config: QueueConfig
): { allowed: boolean; reason?: string } {
  if (queue.length >= config.maxQueueSize) {
    return {
      allowed: false,
      reason: `Queue is full (max ${config.maxQueueSize})`,
    };
  }
  return { allowed: true };
}

/**
 * Check whether an item can start running given current concurrency.
 */
export function canStart(
  running: QueuedExecution[],
  item: QueuedExecution,
  config: QueueConfig
): { allowed: boolean; reason?: string } {
  if (running.length >= config.maxConcurrent) {
    return {
      allowed: false,
      reason: `Max concurrent executions reached (${config.maxConcurrent})`,
    };
  }

  if (config.teamQuota) {
    const teamMax = config.teamQuota[item.teamId];
    if (teamMax !== undefined) {
      const teamRunning = running.filter((r) => r.teamId === item.teamId).length;
      if (teamRunning >= teamMax) {
        return {
          allowed: false,
          reason: `Team quota reached for ${item.teamId} (max ${teamMax})`,
        };
      }
    }
  }

  return { allowed: true };
}

// ─── Batch Processing ────────────────────────────────────────────────────────

/**
 * Get the next batch of items to start running.
 */
export function getNextBatch(
  queue: QueuedExecution[],
  running: QueuedExecution[],
  config: QueueConfig,
  batchSize = 1
): QueuedExecution[] {
  const sorted = sortQueue(filterReady(queue), config.strategy, config);
  const batch: QueuedExecution[] = [];
  const simulatedRunning = [...running];

  for (const item of sorted) {
    if (batch.length >= batchSize) break;
    const check = canStart(simulatedRunning, item, config);
    if (check.allowed) {
      batch.push(item);
      simulatedRunning.push(item);
    }
  }

  return batch;
}

// ─── Wait Time Estimation ────────────────────────────────────────────────────

/**
 * Estimate the wait time in ms before an item would start.
 */
export function estimateWaitTime(
  queue: QueuedExecution[],
  item: QueuedExecution,
  config: QueueConfig
): number {
  const sorted = sortQueue(filterReady(queue), config.strategy, config);
  const position = sorted.findIndex((e) => e.id === item.id);
  if (position === -1) return 0;

  // Items that can run immediately
  const slots = config.maxConcurrent;
  if (position < slots) return 0;

  // Estimate based on average duration of items ahead
  const aheadItems = sorted.slice(0, position);
  const avgDuration =
    aheadItems.filter((e) => e.estimatedDurationMs !== undefined).reduce((sum, e) => sum + (e.estimatedDurationMs ?? 0), 0) /
      Math.max(
        1,
        aheadItems.filter((e) => e.estimatedDurationMs !== undefined).length
      ) || 30000;

  const waitSlots = Math.ceil((position - slots + 1) / slots);
  return waitSlots * avgDuration;
}

// ─── Statistics ──────────────────────────────────────────────────────────────

/**
 * Compute statistics for a queue and its currently running items.
 */
export function computeQueueStats(
  queue: QueuedExecution[],
  running: QueuedExecution[]
): QueueStats {
  const now = Date.now();

  const byPriority: Record<ExecutionPriority, number> = {
    critical: 0,
    high: 0,
    normal: 0,
    low: 0,
    background: 0,
  };

  const byTeam: Record<string, number> = {};

  for (const item of queue) {
    byPriority[item.priority] = (byPriority[item.priority] ?? 0) + 1;
    byTeam[item.teamId] = (byTeam[item.teamId] ?? 0) + 1;
  }

  const waitTimes = queue
    .filter((e) => e.startedAt !== undefined)
    .map((e) => e.startedAt!.getTime() - e.enqueuedAt.getTime());

  const avgWaitTimeMs =
    waitTimes.length > 0
      ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length
      : 0;

  const pendingItems = queue.filter((e) => !e.startedAt);
  const avgDuration =
    running.filter((e) => e.estimatedDurationMs !== undefined).reduce((sum, e) => sum + (e.estimatedDurationMs ?? 0), 0) /
      Math.max(1, running.filter((e) => e.estimatedDurationMs !== undefined).length) || 30000;

  const estimatedDrainTimeMs = pendingItems.length > 0 ? avgDuration * pendingItems.length : 0;

  return {
    total: queue.length + running.length,
    pending: pendingItems.length,
    running: running.length,
    byPriority,
    byTeam,
    avgWaitTimeMs,
    estimatedDrainTimeMs,
  };
}

// ─── Filters ─────────────────────────────────────────────────────────────────

/**
 * Filter queue items by team.
 */
export function filterByTeam(
  queue: QueuedExecution[],
  teamId: string
): QueuedExecution[] {
  return queue.filter((e) => e.teamId === teamId);
}

/**
 * Filter queue items by priority.
 */
export function filterByPriority(
  queue: QueuedExecution[],
  priority: ExecutionPriority
): QueuedExecution[] {
  return queue.filter((e) => e.priority === priority);
}

/**
 * Filter items that are ready to run (scheduledAt <= now or no scheduledAt).
 */
export function filterReady(
  queue: QueuedExecution[],
  now: Date = new Date()
): QueuedExecution[] {
  return queue.filter(
    (e) => !e.scheduledAt || e.scheduledAt.getTime() <= now.getTime()
  );
}

// ─── Fair-Share & Weighted Round-Robin ──────────────────────────────────────

/**
 * Group queue items by teamId for fair-share scheduling.
 */
export function buildFairShareGroups(
  queue: QueuedExecution[]
): Record<string, QueuedExecution[]> {
  const groups: Record<string, QueuedExecution[]> = {};
  for (const item of queue) {
    if (!groups[item.teamId]) groups[item.teamId] = [];
    groups[item.teamId]!.push(item);
  }
  return groups;
}

/**
 * Interleave groups by their weight for weighted round-robin scheduling.
 * Higher weight = more slots per round.
 */
export function applyWeightedRoundRobin(
  groups: Record<string, QueuedExecution[]>,
  weights: Record<string, number>
): QueuedExecution[] {
  // Make mutable copies of each group
  const workGroups: Record<string, QueuedExecution[]> = {};
  for (const [teamId, items] of Object.entries(groups)) {
    workGroups[teamId] = [...items].sort(comparePriority);
  }

  const result: QueuedExecution[] = [];
  const teamIds = Object.keys(workGroups);

  let hasMore = true;
  while (hasMore) {
    hasMore = false;
    for (const teamId of teamIds) {
      const group = workGroups[teamId];
      if (!group || group.length === 0) continue;
      const w = Math.max(1, Math.round(weights[teamId] ?? 1));
      let taken = 0;
      while (taken < w && group.length > 0) {
        result.push(group.shift()!);
        taken++;
      }
      if (group.length > 0) hasMore = true;
    }
  }

  return result;
}

// ─── Stuck Detection ─────────────────────────────────────────────────────────

/**
 * Detect if an execution appears stuck (running for too long).
 *
 * @param item - The execution to check.
 * @param now - Current time (default: new Date()).
 * @param thresholdMs - How long before considered stuck (default: 30 minutes).
 */
export function isStuck(
  item: QueuedExecution,
  now: Date = new Date(),
  thresholdMs = 30 * 60 * 1000
): boolean {
  if (!item.startedAt || item.completedAt) return false;
  return now.getTime() - item.startedAt.getTime() > thresholdMs;
}

// ─── Formatting ──────────────────────────────────────────────────────────────

/**
 * Format queue statistics as a human-readable string.
 */
export function formatQueueStats(stats: QueueStats): string {
  const lines: string[] = [
    `Queue Stats: total=${stats.total}, pending=${stats.pending}, running=${stats.running}`,
    `Priority: critical=${stats.byPriority.critical}, high=${stats.byPriority.high}, normal=${stats.byPriority.normal}, low=${stats.byPriority.low}, background=${stats.byPriority.background}`,
    `Avg wait: ${Math.round(stats.avgWaitTimeMs)}ms`,
    `Est drain: ${Math.round(stats.estimatedDrainTimeMs)}ms`,
  ];
  return lines.join("\n");
}
