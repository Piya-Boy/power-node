/**
 * Phase 88 — Workflow Telemetry Collector
 * Pure utilities for collecting, sampling, filtering, and aggregating
 * telemetry data (metrics, logs, events) from workflow executions.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type MetricType = "counter" | "gauge" | "histogram" | "summary";
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";
export type TelemetryKind = "metric" | "log" | "event" | "span";

export interface MetricDataPoint {
  name: string;
  type: MetricType;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  context: Record<string, unknown>;
  workflowId?: string;
  nodeId?: string;
  executionId?: string;
  timestamp: number;
}

export interface TelemetryEvent {
  id: string;
  name: string;
  kind: TelemetryKind;
  workflowId?: string;
  executionId?: string;
  nodeId?: string;
  properties: Record<string, unknown>;
  measurements: Record<string, number>;
  timestamp: number;
}

export interface TelemetryBuffer {
  metrics: MetricDataPoint[];
  logs: LogEntry[];
  events: TelemetryEvent[];
  maxSize: number;
  droppedCount: number;
}

export interface SamplingConfig {
  rate: number;              // 0.0 – 1.0
  seed?: number;             // deterministic sampling seed
  minLevel?: LogLevel;       // drop logs below this level
  alwaysSampleOnError?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Log Level Ordering
// ─────────────────────────────────────────────────────────────────────────────

const LOG_LEVELS: LogLevel[] = ["trace", "debug", "info", "warn", "error", "fatal"];

export function logLevelIndex(level: LogLevel): number {
  return LOG_LEVELS.indexOf(level);
}

export function isLogLevelAtLeast(actual: LogLevel, min: LogLevel): boolean {
  return logLevelIndex(actual) >= logLevelIndex(min);
}

// ─────────────────────────────────────────────────────────────────────────────
// ID Sequence
// ─────────────────────────────────────────────────────────────────────────────

let _seq = 0;
export function resetSeq(): void { _seq = 0; }

// ─────────────────────────────────────────────────────────────────────────────
// Buffer Management
// ─────────────────────────────────────────────────────────────────────────────

export function createBuffer(maxSize = 10_000): TelemetryBuffer {
  return { metrics: [], logs: [], events: [], maxSize, droppedCount: 0 };
}

export function addMetric(
  buffer: TelemetryBuffer,
  point: MetricDataPoint
): TelemetryBuffer {
  if (buffer.metrics.length >= buffer.maxSize) {
    return { ...buffer, droppedCount: buffer.droppedCount + 1 };
  }
  return { ...buffer, metrics: [...buffer.metrics, point] };
}

export function addLog(
  buffer: TelemetryBuffer,
  entry: LogEntry
): TelemetryBuffer {
  if (buffer.logs.length >= buffer.maxSize) {
    return { ...buffer, droppedCount: buffer.droppedCount + 1 };
  }
  return { ...buffer, logs: [...buffer.logs, entry] };
}

export function addEvent(
  buffer: TelemetryBuffer,
  event: TelemetryEvent
): TelemetryBuffer {
  if (buffer.events.length >= buffer.maxSize) {
    return { ...buffer, droppedCount: buffer.droppedCount + 1 };
  }
  return { ...buffer, events: [...buffer.events, event] };
}

export function clearBuffer(buffer: TelemetryBuffer): TelemetryBuffer {
  return { ...buffer, metrics: [], logs: [], events: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Metric Building
// ─────────────────────────────────────────────────────────────────────────────

export function counter(
  name: string,
  value: number,
  labels: Record<string, string> = {},
  timestamp = Date.now()
): MetricDataPoint {
  return { name, type: "counter", value, labels, timestamp };
}

export function gauge(
  name: string,
  value: number,
  labels: Record<string, string> = {},
  timestamp = Date.now()
): MetricDataPoint {
  return { name, type: "gauge", value, labels, timestamp };
}

export function histogram(
  name: string,
  value: number,
  labels: Record<string, string> = {},
  timestamp = Date.now()
): MetricDataPoint {
  return { name, type: "histogram", value, labels, timestamp };
}

// ─────────────────────────────────────────────────────────────────────────────
// Log Building
// ─────────────────────────────────────────────────────────────────────────────

export function log(
  level: LogLevel,
  message: string,
  context: Record<string, unknown> = {},
  timestamp = Date.now()
): LogEntry {
  return { level, message, context, timestamp };
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Building
// ─────────────────────────────────────────────────────────────────────────────

export function telemetryEvent(
  name: string,
  kind: TelemetryKind = "event",
  options: Partial<Omit<TelemetryEvent, "id" | "name" | "kind">> & { timestamp?: number } = {}
): TelemetryEvent {
  return {
    id: `tel_${++_seq}`,
    name,
    kind,
    properties: {},
    measurements: {},
    timestamp: Date.now(),
    ...options,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sampling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simple deterministic sampler using a pseudo-random based on id + seed.
 */
export function shouldSample(id: string, config: SamplingConfig): boolean {
  if (config.rate >= 1.0) return true;
  if (config.rate <= 0.0) return false;

  // Deterministic hash
  const seed = config.seed ?? 12345;
  let h = seed;
  const key = id + seed;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(31, h) + key.charCodeAt(i);
    h = h & h;
  }
  const normalized = Math.abs(h) / 2_147_483_647;
  return normalized < config.rate;
}

export function sampleLogs(
  logs: LogEntry[],
  config: SamplingConfig
): LogEntry[] {
  return logs.filter((entry) => {
    if (config.alwaysSampleOnError && (entry.level === "error" || entry.level === "fatal")) return true;
    if (config.minLevel && !isLogLevelAtLeast(entry.level, config.minLevel)) return false;
    return shouldSample(`${entry.timestamp}:${entry.message}`, config);
  });
}

export function sampleMetrics(
  metrics: MetricDataPoint[],
  config: SamplingConfig
): MetricDataPoint[] {
  if (config.rate >= 1.0) return metrics;
  return metrics.filter((m) =>
    shouldSample(`${m.name}:${m.timestamp}`, config)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtering
// ─────────────────────────────────────────────────────────────────────────────

export function filterLogsByLevel(logs: LogEntry[], minLevel: LogLevel): LogEntry[] {
  return logs.filter((e) => isLogLevelAtLeast(e.level, minLevel));
}

export function filterLogsByWorkflow(logs: LogEntry[], workflowId: string): LogEntry[] {
  return logs.filter((e) => e.workflowId === workflowId);
}

export function filterMetricsByName(metrics: MetricDataPoint[], name: string): MetricDataPoint[] {
  return metrics.filter((m) => m.name === name);
}

export function filterMetricsByLabel(
  metrics: MetricDataPoint[],
  labelKey: string,
  labelValue: string
): MetricDataPoint[] {
  return metrics.filter((m) => m.labels[labelKey] === labelValue);
}

export function filterEventsByName(events: TelemetryEvent[], name: string): TelemetryEvent[] {
  return events.filter((e) => e.name === name);
}

export function filterEventsByKind(events: TelemetryEvent[], kind: TelemetryKind): TelemetryEvent[] {
  return events.filter((e) => e.kind === kind);
}

// ─────────────────────────────────────────────────────────────────────────────
// Metric Aggregation
// ─────────────────────────────────────────────────────────────────────────────

export interface AggregatedMetric {
  name: string;
  type: MetricType;
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  labels: Record<string, string>;
  windowMs: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function aggregateMetrics(
  metrics: MetricDataPoint[],
  windowMs?: number
): AggregatedMetric[] {
  // Group by name
  const byName = new Map<string, MetricDataPoint[]>();
  for (const m of metrics) {
    const list = byName.get(m.name) ?? [];
    list.push(m);
    byName.set(m.name, list);
  }

  const results: AggregatedMetric[] = [];
  for (const [name, points] of byName) {
    const values = points.map((p) => p.value).sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const minTs = Math.min(...points.map((p) => p.timestamp));
    const maxTs = Math.max(...points.map((p) => p.timestamp));

    results.push({
      name,
      type: points[0].type,
      count: values.length,
      sum,
      min: values[0],
      max: values[values.length - 1],
      avg: sum / values.length,
      p50: percentile(values, 0.5),
      p95: percentile(values, 0.95),
      p99: percentile(values, 0.99),
      labels: points[0].labels,
      windowMs: windowMs ?? (maxTs - minTs),
    });
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Log Analysis
// ─────────────────────────────────────────────────────────────────────────────

export interface LogSummary {
  total: number;
  byLevel: Record<LogLevel, number>;
  errorMessages: string[];
  uniqueMessages: number;
}

export function summarizeLogs(logs: LogEntry[]): LogSummary {
  const byLevel: Record<LogLevel, number> = {
    trace: 0, debug: 0, info: 0, warn: 0, error: 0, fatal: 0,
  };
  const errorMessages: string[] = [];
  const messageSet = new Set<string>();

  for (const entry of logs) {
    byLevel[entry.level]++;
    messageSet.add(entry.message);
    if (entry.level === "error" || entry.level === "fatal") {
      errorMessages.push(entry.message);
    }
  }

  return {
    total: logs.length,
    byLevel,
    errorMessages,
    uniqueMessages: messageSet.size,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Time Window Operations
// ─────────────────────────────────────────────────────────────────────────────

export function filterMetricsByWindow(
  metrics: MetricDataPoint[],
  from: number,
  to: number
): MetricDataPoint[] {
  return metrics.filter((m) => m.timestamp >= from && m.timestamp <= to);
}

export function filterLogsByWindow(
  logs: LogEntry[],
  from: number,
  to: number
): LogEntry[] {
  return logs.filter((e) => e.timestamp >= from && e.timestamp <= to);
}

// ─────────────────────────────────────────────────────────────────────────────
// Buffer Stats
// ─────────────────────────────────────────────────────────────────────────────

export interface BufferStats {
  metricCount: number;
  logCount: number;
  eventCount: number;
  total: number;
  droppedCount: number;
  fillPercent: number;
  logLevelBreakdown: Record<LogLevel, number>;
  metricNameBreakdown: Record<string, number>;
}

export function getBufferStats(buffer: TelemetryBuffer): BufferStats {
  const logLevelBreakdown: Record<LogLevel, number> = {
    trace: 0, debug: 0, info: 0, warn: 0, error: 0, fatal: 0,
  };
  const metricNameBreakdown: Record<string, number> = {};

  for (const l of buffer.logs) logLevelBreakdown[l.level]++;
  for (const m of buffer.metrics) metricNameBreakdown[m.name] = (metricNameBreakdown[m.name] ?? 0) + 1;

  const total = buffer.metrics.length + buffer.logs.length + buffer.events.length;
  return {
    metricCount: buffer.metrics.length,
    logCount: buffer.logs.length,
    eventCount: buffer.events.length,
    total,
    droppedCount: buffer.droppedCount,
    fillPercent: (total / buffer.maxSize) * 100,
    logLevelBreakdown,
    metricNameBreakdown,
  };
}
