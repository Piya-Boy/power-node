/**
 * Lightweight structured event log for workflow execution tracing.
 * Events are stored in-memory during execution and can be persisted.
 */

export type EventLevel = "debug" | "info" | "warn" | "error";

export interface ExecutionEvent {
  id: string;
  timestamp: string;
  level: EventLevel;
  nodeId?: string;
  nodeType?: string;
  message: string;
  data?: Record<string, unknown>;
  durationMs?: number;
}

let eventIdCounter = 0;

function nextEventId(): string {
  return `evt_${Date.now()}_${++eventIdCounter}`;
}

export function createEvent(
  level: EventLevel,
  message: string,
  options?: {
    nodeId?: string;
    nodeType?: string;
    data?: Record<string, unknown>;
    durationMs?: number;
  },
): ExecutionEvent {
  return {
    id: nextEventId(),
    timestamp: new Date().toISOString(),
    level,
    message,
    ...options,
  };
}

export function createNodeStartEvent(nodeId: string, nodeType: string): ExecutionEvent {
  return createEvent("info", `Starting node: ${nodeType}`, { nodeId, nodeType });
}

export function createNodeSuccessEvent(
  nodeId: string,
  nodeType: string,
  durationMs: number,
): ExecutionEvent {
  return createEvent("info", `Node completed: ${nodeType} (${durationMs}ms)`, {
    nodeId,
    nodeType,
    durationMs,
  });
}

export function createNodeErrorEvent(
  nodeId: string,
  nodeType: string,
  error: unknown,
  durationMs?: number,
): ExecutionEvent {
  const message = error instanceof Error ? error.message : String(error);
  return createEvent("error", `Node failed: ${nodeType} - ${message}`, {
    nodeId,
    nodeType,
    durationMs,
    data: error instanceof Error ? { stack: error.stack } : { error: message },
  });
}

export function filterEventsByLevel(
  events: ExecutionEvent[],
  level: EventLevel,
): ExecutionEvent[] {
  const levelOrder: Record<EventLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };
  const minLevel = levelOrder[level];
  return events.filter((e) => levelOrder[e.level] >= minLevel);
}

export function filterEventsByNode(
  events: ExecutionEvent[],
  nodeId: string,
): ExecutionEvent[] {
  return events.filter((e) => e.nodeId === nodeId);
}

export function getEventSummary(events: ExecutionEvent[]): {
  total: number;
  byLevel: Record<EventLevel, number>;
  errors: ExecutionEvent[];
  totalDurationMs: number;
} {
  const byLevel: Record<EventLevel, number> = { debug: 0, info: 0, warn: 0, error: 0 };
  const errors: ExecutionEvent[] = [];
  let totalDurationMs = 0;

  for (const event of events) {
    byLevel[event.level]++;
    if (event.level === "error") errors.push(event);
    if (event.durationMs) totalDurationMs += event.durationMs;
  }

  return { total: events.length, byLevel, errors, totalDurationMs };
}

export function formatEventLog(events: ExecutionEvent[]): string {
  return events
    .map((e) => {
      const prefix = `[${e.timestamp}] [${e.level.toUpperCase()}]`;
      const nodeInfo = e.nodeId ? ` [${e.nodeType || e.nodeId}]` : "";
      return `${prefix}${nodeInfo} ${e.message}`;
    })
    .join("\n");
}
