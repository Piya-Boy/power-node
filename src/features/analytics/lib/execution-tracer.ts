/**
 * Phase 73 — Workflow Execution Tracer
 * Pure utilities for building distributed-trace-style execution spans,
 * computing critical paths, and generating structured trace reports.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SpanStatus = "running" | "success" | "error" | "skipped" | "timeout";

export type SpanKind = "workflow" | "node" | "trigger" | "sub-workflow" | "api-call" | "db-query";

export interface TraceSpan {
  spanId: string;
  parentSpanId?: string;
  traceId: string;
  name: string;
  kind: SpanKind;
  nodeId?: string;
  nodeType?: string;
  startTime: number;      // Unix ms
  endTime?: number;       // Unix ms (absent while running)
  durationMs?: number;    // computed when ended
  status: SpanStatus;
  errorMessage?: string;
  attributes: Record<string, unknown>;
  events: SpanEvent[];
}

export interface SpanEvent {
  name: string;
  timestamp: number;     // Unix ms
  attributes?: Record<string, unknown>;
}

export interface ExecutionTrace {
  traceId: string;
  workflowId: string;
  executionId: string;
  rootSpanId: string;
  spans: Map<string, TraceSpan>;
  startTime: number;
  endTime?: number;
  totalDurationMs?: number;
  status: SpanStatus;
}

export interface SpanSummary {
  spanId: string;
  name: string;
  kind: SpanKind;
  durationMs: number;
  status: SpanStatus;
  depth: number;          // nesting depth (0 = root)
  childCount: number;
}

export interface CriticalPath {
  spans: TraceSpan[];
  totalDurationMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Span Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new trace span.
 */
export function createSpan(
  params: Omit<TraceSpan, "durationMs" | "events" | "attributes"> & {
    events?: SpanEvent[];
    attributes?: Record<string, unknown>;
  }
): TraceSpan {
  return {
    ...params,
    attributes: params.attributes ?? {},
    events: params.events ?? [],
    durationMs: params.endTime !== undefined ? params.endTime - params.startTime : undefined,
  };
}

/**
 * End a span and compute its duration.
 */
export function endSpan(
  span: TraceSpan,
  endTime: number,
  status: SpanStatus,
  errorMessage?: string
): TraceSpan {
  return {
    ...span,
    endTime,
    durationMs: endTime - span.startTime,
    status,
    errorMessage,
  };
}

/**
 * Add an event to a span.
 */
export function addSpanEvent(
  span: TraceSpan,
  event: SpanEvent
): TraceSpan {
  return { ...span, events: [...span.events, event] };
}

/**
 * Set an attribute on a span.
 */
export function setSpanAttribute(
  span: TraceSpan,
  key: string,
  value: unknown
): TraceSpan {
  return { ...span, attributes: { ...span.attributes, [key]: value } };
}

// ─────────────────────────────────────────────────────────────────────────────
// Trace Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new execution trace with a root span.
 */
export function createTrace(
  traceId: string,
  workflowId: string,
  executionId: string,
  rootSpan: TraceSpan
): ExecutionTrace {
  const spans = new Map<string, TraceSpan>();
  spans.set(rootSpan.spanId, rootSpan);
  return {
    traceId,
    workflowId,
    executionId,
    rootSpanId: rootSpan.spanId,
    spans,
    startTime: rootSpan.startTime,
    status: "running",
  };
}

/**
 * Add a span to an existing trace.
 */
export function addSpan(trace: ExecutionTrace, span: TraceSpan): ExecutionTrace {
  const spans = new Map(trace.spans);
  spans.set(span.spanId, span);
  return { ...trace, spans };
}

/**
 * Update an existing span in the trace.
 */
export function updateSpan(trace: ExecutionTrace, span: TraceSpan): ExecutionTrace {
  return addSpan(trace, span);
}

/**
 * Finalize a trace — set endTime, totalDuration, and overall status.
 */
export function finalizeTrace(
  trace: ExecutionTrace,
  endTime: number
): ExecutionTrace {
  const allSpans = [...trace.spans.values()];
  const hasError = allSpans.some((s) => s.status === "error");
  const hasTimeout = allSpans.some((s) => s.status === "timeout");
  const status: SpanStatus = hasError ? "error" : hasTimeout ? "timeout" : "success";
  return {
    ...trace,
    endTime,
    totalDurationMs: endTime - trace.startTime,
    status,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Querying
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all direct children of a span.
 */
export function getChildSpans(trace: ExecutionTrace, spanId: string): TraceSpan[] {
  return [...trace.spans.values()].filter((s) => s.parentSpanId === spanId);
}

/**
 * Get all descendants of a span (recursive DFS).
 */
export function getDescendants(trace: ExecutionTrace, spanId: string): TraceSpan[] {
  const result: TraceSpan[] = [];
  const children = getChildSpans(trace, spanId);
  for (const child of children) {
    result.push(child, ...getDescendants(trace, child.spanId));
  }
  return result;
}

/**
 * Get the path from root to a given span.
 */
export function getAncestorPath(trace: ExecutionTrace, spanId: string): TraceSpan[] {
  const path: TraceSpan[] = [];
  let current = trace.spans.get(spanId);
  while (current) {
    path.unshift(current);
    current = current.parentSpanId ? trace.spans.get(current.parentSpanId) : undefined;
  }
  return path;
}

/**
 * Get the nesting depth of a span (0 = root).
 */
export function getSpanDepth(trace: ExecutionTrace, spanId: string): number {
  return getAncestorPath(trace, spanId).length - 1;
}

/**
 * Get spans filtered by status.
 */
export function getSpansByStatus(trace: ExecutionTrace, status: SpanStatus): TraceSpan[] {
  return [...trace.spans.values()].filter((s) => s.status === status);
}

/**
 * Get spans filtered by kind.
 */
export function getSpansByKind(trace: ExecutionTrace, kind: SpanKind): TraceSpan[] {
  return [...trace.spans.values()].filter((s) => s.kind === kind);
}

// ─────────────────────────────────────────────────────────────────────────────
// Critical Path
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the critical path (longest sequential chain of spans) in the trace.
 * Uses DFS from root, accumulating durations through completed spans.
 */
export function computeCriticalPath(trace: ExecutionTrace): CriticalPath {
  function longestPath(spanId: string): TraceSpan[] {
    const span = trace.spans.get(spanId);
    if (!span || span.durationMs === undefined) return [];

    const children = getChildSpans(trace, spanId);
    if (children.length === 0) return [span];

    let best: TraceSpan[] = [];
    for (const child of children) {
      const childPath = longestPath(child.spanId);
      if (childPath.length > best.length ||
        (childPath.length === best.length &&
          childPath.reduce((s, c) => s + (c.durationMs ?? 0), 0) >
          best.reduce((s, c) => s + (c.durationMs ?? 0), 0))) {
        best = childPath;
      }
    }
    return [span, ...best];
  }

  const spans = longestPath(trace.rootSpanId);
  const totalDurationMs = spans.reduce((s, sp) => s + (sp.durationMs ?? 0), 0);
  return { spans, totalDurationMs };
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary & Reporting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Summarize all spans in a trace.
 */
export function summarizeSpans(trace: ExecutionTrace): SpanSummary[] {
  return [...trace.spans.values()].map((span) => ({
    spanId: span.spanId,
    name: span.name,
    kind: span.kind,
    durationMs: span.durationMs ?? 0,
    status: span.status,
    depth: getSpanDepth(trace, span.spanId),
    childCount: getChildSpans(trace, span.spanId).length,
  }));
}

/**
 * Get the slowest N spans by duration.
 */
export function getSlowestSpans(trace: ExecutionTrace, n: number): TraceSpan[] {
  return [...trace.spans.values()]
    .filter((s) => s.durationMs !== undefined)
    .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
    .slice(0, n);
}

/**
 * Get the error spans with messages.
 */
export function getErrorSpans(trace: ExecutionTrace): TraceSpan[] {
  return getSpansByStatus(trace, "error");
}

/**
 * Compute total time spent per span kind.
 */
export function getDurationByKind(trace: ExecutionTrace): Map<SpanKind, number> {
  const map = new Map<SpanKind, number>();
  for (const span of trace.spans.values()) {
    if (span.durationMs !== undefined) {
      map.set(span.kind, (map.get(span.kind) ?? 0) + span.durationMs);
    }
  }
  return map;
}

/**
 * Build a flamegraph-style flat representation sorted by startTime.
 */
export function buildFlamegraph(trace: ExecutionTrace): Array<{
  spanId: string;
  name: string;
  startOffset: number;    // ms from trace start
  durationMs: number;
  depth: number;
  status: SpanStatus;
}> {
  return [...trace.spans.values()]
    .filter((s) => s.durationMs !== undefined)
    .map((s) => ({
      spanId: s.spanId,
      name: s.name,
      startOffset: s.startTime - trace.startTime,
      durationMs: s.durationMs!,
      depth: getSpanDepth(trace, s.spanId),
      status: s.status,
    }))
    .sort((a, b) => a.startOffset - b.startOffset || a.depth - b.depth);
}

/**
 * Build a simple trace summary for display.
 */
export function getTraceSummary(trace: ExecutionTrace): {
  traceId: string;
  workflowId: string;
  totalSpans: number;
  successSpans: number;
  errorSpans: number;
  totalDurationMs: number;
  status: SpanStatus;
  slowestSpanName: string | undefined;
  criticalPathMs: number;
} {
  const allSpans = [...trace.spans.values()];
  const successSpans = allSpans.filter((s) => s.status === "success").length;
  const errorSpans = allSpans.filter((s) => s.status === "error").length;
  const slowest = getSlowestSpans(trace, 1)[0];
  const criticalPath = computeCriticalPath(trace);

  return {
    traceId: trace.traceId,
    workflowId: trace.workflowId,
    totalSpans: allSpans.length,
    successSpans,
    errorSpans,
    totalDurationMs: trace.totalDurationMs ?? 0,
    status: trace.status,
    slowestSpanName: slowest?.name,
    criticalPathMs: criticalPath.totalDurationMs,
  };
}
