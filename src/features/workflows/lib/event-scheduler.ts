/**
 * Phase 78 — Workflow Event Scheduler
 * Pure utilities for managing event-based triggers: cron, interval,
 * one-time, debounce, and throttle scheduling for workflow automation.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type TriggerKind = "cron" | "interval" | "once" | "debounce" | "throttle" | "manual";
export type TriggerStatus = "active" | "paused" | "completed" | "failed" | "cancelled";

export interface CronTrigger {
  kind: "cron";
  expression: string;   // e.g. "0 9 * * 1-5"
  timezone?: string;
}

export interface IntervalTrigger {
  kind: "interval";
  intervalMs: number;
  maxRuns?: number;
}

export interface OnceTrigger {
  kind: "once";
  runAt: number;        // epoch ms
}

export interface DebounceTrigger {
  kind: "debounce";
  delayMs: number;
  leading?: boolean;
  trailing?: boolean;
}

export interface ThrottleTrigger {
  kind: "throttle";
  windowMs: number;
  maxCalls: number;
}

export interface ManualTrigger {
  kind: "manual";
}

export type TriggerConfig =
  | CronTrigger
  | IntervalTrigger
  | OnceTrigger
  | DebounceTrigger
  | ThrottleTrigger
  | ManualTrigger;

export interface ScheduledEvent {
  id: string;
  workflowId: string;
  name: string;
  trigger: TriggerConfig;
  status: TriggerStatus;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  nextRunAt?: number;
  runCount: number;
  errorCount: number;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface RunRecord {
  eventId: string;
  runAt: number;
  durationMs: number;
  success: boolean;
  error?: string;
}

export interface DebounceState {
  eventId: string;
  lastCallAt: number;
  pendingCallAt?: number;
  callCount: number;
}

export interface ThrottleState {
  eventId: string;
  windowStart: number;
  callsInWindow: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Factories
// ─────────────────────────────────────────────────────────────────────────────

export function createEvent(
  id: string,
  workflowId: string,
  name: string,
  trigger: TriggerConfig,
  now = Date.now()
): ScheduledEvent {
  return {
    id,
    workflowId,
    name,
    trigger,
    status: "active",
    createdAt: now,
    updatedAt: now,
    runCount: 0,
    errorCount: 0,
    tags: [],
    metadata: {},
  };
}

export function updateEventStatus(
  event: ScheduledEvent,
  status: TriggerStatus,
  now = Date.now()
): ScheduledEvent {
  return { ...event, status, updatedAt: now };
}

export function tagEvent(event: ScheduledEvent, tags: string[]): ScheduledEvent {
  const merged = Array.from(new Set([...event.tags, ...tags]));
  return { ...event, tags: merged, updatedAt: Date.now() };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cron Parsing & Next-Run Calculation
// ─────────────────────────────────────────────────────────────────────────────

export interface CronParts {
  minute: number[];
  hour: number[];
  dom: number[];    // day of month
  month: number[];
  dow: number[];    // day of week (0=Sun)
}

function expandField(field: string, min: number, max: number): number[] {
  if (field === "*") return Array.from({ length: max - min + 1 }, (_, i) => i + min);

  const result: number[] = [];
  for (const part of field.split(",")) {
    if (part.includes("/")) {
      const [range, stepStr] = part.split("/");
      const step = parseInt(stepStr, 10);
      const [lo, hi] = range === "*" ? [min, max] : range.split("-").map(Number);
      for (let i = lo; i <= (hi ?? lo); i += step) result.push(i);
    } else if (part.includes("-")) {
      const [lo, hi] = part.split("-").map(Number);
      for (let i = lo; i <= hi; i++) result.push(i);
    } else {
      result.push(parseInt(part, 10));
    }
  }
  return [...new Set(result)].sort((a, b) => a - b).filter((v) => v >= min && v <= max);
}

export function parseCron(expression: string): CronParts | { error: string } {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return { error: `Expected 5 fields, got ${parts.length}` };
  try {
    return {
      minute: expandField(parts[0], 0, 59),
      hour: expandField(parts[1], 0, 23),
      dom: expandField(parts[2], 1, 31),
      month: expandField(parts[3], 1, 12),
      dow: expandField(parts[4], 0, 6),
    };
  } catch {
    return { error: "Invalid cron expression" };
  }
}

export function isValidCron(expression: string): boolean {
  const result = parseCron(expression);
  return !("error" in result);
}

/**
 * Compute the next cron run time after `after` (epoch ms).
 * Returns undefined if no valid next run can be found within 4 years.
 */
export function nextCronRun(expression: string, after: number): number | undefined {
  const parsed = parseCron(expression);
  if ("error" in parsed) return undefined;

  // Start 1 minute after `after`
  const start = new Date(after + 60_000);
  start.setSeconds(0, 0);

  const limit = after + 4 * 365 * 24 * 60 * 60 * 1000;

  let t = start.getTime();
  while (t < limit) {
    const d = new Date(t);
    const min = d.getUTCMinutes();
    const hour = d.getUTCHours();
    const dom = d.getUTCDate();
    const month = d.getUTCMonth() + 1;
    const dow = d.getUTCDay();

    if (
      parsed.month.includes(month) &&
      parsed.dom.includes(dom) &&
      parsed.dow.includes(dow) &&
      parsed.hour.includes(hour) &&
      parsed.minute.includes(min)
    ) {
      return t;
    }
    // Advance by 1 minute
    t += 60_000;
  }
  return undefined;
}

/**
 * Get the next N scheduled runs after `after`.
 */
export function nextNCronRuns(expression: string, after: number, n: number): number[] {
  const runs: number[] = [];
  let cursor = after;
  while (runs.length < n) {
    const next = nextCronRun(expression, cursor);
    if (next === undefined) break;
    runs.push(next);
    cursor = next;
  }
  return runs;
}

// ─────────────────────────────────────────────────────────────────────────────
// Interval Scheduling
// ─────────────────────────────────────────────────────────────────────────────

export function nextIntervalRun(
  trigger: IntervalTrigger,
  lastRunAt: number | undefined,
  createdAt: number,
  runCount: number
): number | undefined {
  if (trigger.maxRuns !== undefined && runCount >= trigger.maxRuns) return undefined;
  const base = lastRunAt ?? createdAt;
  return base + trigger.intervalMs;
}

// ─────────────────────────────────────────────────────────────────────────────
// One-time Scheduling
// ─────────────────────────────────────────────────────────────────────────────

export function isOnceDue(trigger: OnceTrigger, runCount: number, now: number): boolean {
  return runCount === 0 && now >= trigger.runAt;
}

// ─────────────────────────────────────────────────────────────────────────────
// Debounce Logic
// ─────────────────────────────────────────────────────────────────────────────

export function createDebounceState(eventId: string, now: number): DebounceState {
  return { eventId, lastCallAt: now, callCount: 1 };
}

export function recordDebounceCall(state: DebounceState, now: number): DebounceState {
  return {
    ...state,
    lastCallAt: now,
    callCount: state.callCount + 1,
  };
}

/**
 * Returns the epoch ms when the debounced call should fire (trailing edge).
 */
export function getDebounceFireTime(
  state: DebounceState,
  trigger: DebounceTrigger
): number {
  return state.lastCallAt + trigger.delayMs;
}

/**
 * Returns true if the debounce timer has expired and trailing call should fire.
 */
export function shouldFireDebounce(
  state: DebounceState,
  trigger: DebounceTrigger,
  now: number
): boolean {
  const trailing = trigger.trailing !== false; // default trailing=true
  return trailing && now >= getDebounceFireTime(state, trigger);
}

// ─────────────────────────────────────────────────────────────────────────────
// Throttle Logic
// ─────────────────────────────────────────────────────────────────────────────

export function createThrottleState(eventId: string, now: number): ThrottleState {
  return { eventId, windowStart: now, callsInWindow: 1 };
}

export function recordThrottleCall(
  state: ThrottleState,
  trigger: ThrottleTrigger,
  now: number
): ThrottleState {
  if (now - state.windowStart >= trigger.windowMs) {
    // New window
    return { ...state, windowStart: now, callsInWindow: 1 };
  }
  return { ...state, callsInWindow: state.callsInWindow + 1 };
}

export function isThrottled(
  state: ThrottleState,
  trigger: ThrottleTrigger,
  now: number
): boolean {
  if (now - state.windowStart >= trigger.windowMs) return false;
  return state.callsInWindow >= trigger.maxCalls;
}

export function getThrottleWindowRemaining(
  state: ThrottleState,
  trigger: ThrottleTrigger,
  now: number
): number {
  const elapsed = now - state.windowStart;
  return Math.max(0, trigger.windowMs - elapsed);
}

// ─────────────────────────────────────────────────────────────────────────────
// Run History
// ─────────────────────────────────────────────────────────────────────────────

export function recordRun(
  event: ScheduledEvent,
  record: RunRecord
): ScheduledEvent {
  return {
    ...event,
    runCount: event.runCount + 1,
    errorCount: record.success ? event.errorCount : event.errorCount + 1,
    lastRunAt: record.runAt,
    updatedAt: record.runAt,
    // Mark "once" events as completed after first run
    status: event.trigger.kind === "once" ? "completed" : event.status,
  };
}

export function getSuccessRate(runs: RunRecord[]): number {
  if (runs.length === 0) return 0;
  const successes = runs.filter((r) => r.success).length;
  return successes / runs.length;
}

export function getAverageDuration(runs: RunRecord[]): number {
  if (runs.length === 0) return 0;
  return runs.reduce((sum, r) => sum + r.durationMs, 0) / runs.length;
}

export function getRunsInWindow(runs: RunRecord[], from: number, to: number): RunRecord[] {
  return runs.filter((r) => r.runAt >= from && r.runAt <= to);
}

export function getRecentRuns(runs: RunRecord[], n: number): RunRecord[] {
  return [...runs].sort((a, b) => b.runAt - a.runAt).slice(0, n);
}

export function getFailedRuns(runs: RunRecord[]): RunRecord[] {
  return runs.filter((r) => !r.success);
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Filtering & Querying
// ─────────────────────────────────────────────────────────────────────────────

export function getEventsByWorkflow(
  events: ScheduledEvent[],
  workflowId: string
): ScheduledEvent[] {
  return events.filter((e) => e.workflowId === workflowId);
}

export function getEventsByStatus(
  events: ScheduledEvent[],
  status: TriggerStatus
): ScheduledEvent[] {
  return events.filter((e) => e.status === status);
}

export function getEventsByKind(
  events: ScheduledEvent[],
  kind: TriggerKind
): ScheduledEvent[] {
  return events.filter((e) => e.trigger.kind === kind);
}

export function getEventsByTag(
  events: ScheduledEvent[],
  tag: string
): ScheduledEvent[] {
  return events.filter((e) => e.tags.includes(tag));
}

export function getOverdueEvents(
  events: ScheduledEvent[],
  now: number
): ScheduledEvent[] {
  return events.filter(
    (e) => e.status === "active" && e.nextRunAt !== undefined && e.nextRunAt < now
  );
}

export function getDueEvents(
  events: ScheduledEvent[],
  now: number
): ScheduledEvent[] {
  return events.filter(
    (e) => e.status === "active" && e.nextRunAt !== undefined && e.nextRunAt <= now
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Next Run Computation
// ─────────────────────────────────────────────────────────────────────────────

export function computeNextRun(
  event: ScheduledEvent,
  now: number
): number | undefined {
  const { trigger } = event;
  switch (trigger.kind) {
    case "cron":
      return nextCronRun(trigger.expression, event.lastRunAt ?? now - 60_000);
    case "interval":
      return nextIntervalRun(trigger, event.lastRunAt, event.createdAt, event.runCount);
    case "once":
      return event.runCount === 0 ? trigger.runAt : undefined;
    case "manual":
    case "debounce":
    case "throttle":
      return undefined;
  }
}

export function setNextRun(
  event: ScheduledEvent,
  now: number
): ScheduledEvent {
  const nextRunAt = computeNextRun(event, now);
  return { ...event, nextRunAt, updatedAt: now };
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch Operations
// ─────────────────────────────────────────────────────────────────────────────

export function pauseEvents(
  events: ScheduledEvent[],
  ids: string[],
  now = Date.now()
): ScheduledEvent[] {
  const idSet = new Set(ids);
  return events.map((e) =>
    idSet.has(e.id) && e.status === "active"
      ? updateEventStatus(e, "paused", now)
      : e
  );
}

export function resumeEvents(
  events: ScheduledEvent[],
  ids: string[],
  now = Date.now()
): ScheduledEvent[] {
  const idSet = new Set(ids);
  return events.map((e) =>
    idSet.has(e.id) && e.status === "paused"
      ? updateEventStatus(e, "active", now)
      : e
  );
}

export function cancelEvents(
  events: ScheduledEvent[],
  ids: string[],
  now = Date.now()
): ScheduledEvent[] {
  const idSet = new Set(ids);
  return events.map((e) =>
    idSet.has(e.id) && (e.status === "active" || e.status === "paused")
      ? updateEventStatus(e, "cancelled", now)
      : e
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats & Summary
// ─────────────────────────────────────────────────────────────────────────────

export interface SchedulerStats {
  total: number;
  byStatus: Record<TriggerStatus, number>;
  byKind: Record<TriggerKind, number>;
  totalRuns: number;
  totalErrors: number;
  overallSuccessRate: number;
  activeCount: number;
  overdueCount: number;
}

export function computeSchedulerStats(
  events: ScheduledEvent[],
  now = Date.now()
): SchedulerStats {
  const byStatus: Record<TriggerStatus, number> = {
    active: 0, paused: 0, completed: 0, failed: 0, cancelled: 0,
  };
  const byKind: Record<TriggerKind, number> = {
    cron: 0, interval: 0, once: 0, debounce: 0, throttle: 0, manual: 0,
  };

  let totalRuns = 0;
  let totalErrors = 0;

  for (const e of events) {
    byStatus[e.status]++;
    byKind[e.trigger.kind]++;
    totalRuns += e.runCount;
    totalErrors += e.errorCount;
  }

  return {
    total: events.length,
    byStatus,
    byKind,
    totalRuns,
    totalErrors,
    overallSuccessRate: totalRuns === 0 ? 0 : (totalRuns - totalErrors) / totalRuns,
    activeCount: byStatus.active,
    overdueCount: getOverdueEvents(events, now).length,
  };
}

export function summarizeEvent(event: ScheduledEvent): string {
  const { trigger } = event;
  let triggerDesc = "";
  switch (trigger.kind) {
    case "cron": triggerDesc = `cron(${trigger.expression})`; break;
    case "interval": triggerDesc = `every ${trigger.intervalMs}ms`; break;
    case "once": triggerDesc = `once at ${new Date(trigger.runAt).toISOString()}`; break;
    case "debounce": triggerDesc = `debounce(${trigger.delayMs}ms)`; break;
    case "throttle": triggerDesc = `throttle(${trigger.maxCalls}/${trigger.windowMs}ms)`; break;
    case "manual": triggerDesc = "manual"; break;
  }
  return `[${event.status.toUpperCase()}] ${event.name} — ${triggerDesc} — runs: ${event.runCount}, errors: ${event.errorCount}`;
}
