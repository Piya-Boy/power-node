/**
 * Phase 61 — Workflow Schedule Manager
 * Pure utilities for managing cron schedules: parsing, validation,
 * next-run computation, human-readable descriptions, and conflict detection.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ScheduleStatus = "active" | "paused" | "disabled" | "expired";

export type TimeZone = string; // IANA timezone e.g. "America/New_York"

export interface CronExpression {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

export interface WorkflowSchedule {
  id: string;
  workflowId: string;
  name: string;
  cronExpression: string;
  timezone: TimeZone;
  status: ScheduleStatus;
  createdAt: Date;
  lastRunAt?: Date;
  nextRunAt?: Date;
  expiresAt?: Date;
  runCount: number;
  maxRuns?: number;
  description?: string;
  tags: string[];
}

export interface ScheduleValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  parsed?: CronExpression;
}

export interface ScheduleConflict {
  scheduleA: string;
  scheduleB: string;
  reason: string;
  overlapsWithinMinutes: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cron Parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a 5-field cron expression into its components.
 */
export function parseCron(expression: string): CronExpression | null {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  return { minute, hour, dayOfMonth, month, dayOfWeek };
}

/**
 * Validate a cron expression (5-field standard cron).
 */
export function validateCron(expression: string): ScheduleValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const parsed = parseCron(expression);
  if (!parsed) {
    return { valid: false, errors: ["Cron expression must have exactly 5 fields"], warnings };
  }

  const { minute, hour, dayOfMonth, month, dayOfWeek } = parsed;

  validateField("minute", minute, 0, 59, errors);
  validateField("hour", hour, 0, 23, errors);
  validateField("dayOfMonth", dayOfMonth, 1, 31, errors);
  validateField("month", month, 1, 12, errors);
  validateField("dayOfWeek", dayOfWeek, 0, 7, errors); // 0 and 7 both = Sunday

  // Warn on high-frequency schedules
  if (minute.includes("*") && !minute.includes("/") && hour === "*") {
    warnings.push("This schedule runs every minute — consider if this is intentional");
  }

  if (minute.startsWith("*/") && parseInt(minute.slice(2), 10) < 5) {
    warnings.push("Schedules more frequent than every 5 minutes may cause high load");
  }

  return { valid: errors.length === 0, errors, warnings, parsed: errors.length === 0 ? parsed : undefined };
}

/**
 * Format a CronExpression back to a cron string.
 */
export function formatCron(expr: CronExpression): string {
  return `${expr.minute} ${expr.hour} ${expr.dayOfMonth} ${expr.month} ${expr.dayOfWeek}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Human-readable Descriptions
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Generate a human-readable description of a cron expression.
 */
export function describeCron(expression: string): string {
  const parsed = parseCron(expression);
  if (!parsed) return "Invalid cron expression";

  const { minute, hour, dayOfMonth, month, dayOfWeek } = parsed;

  // Common patterns
  if (expression === "* * * * *") return "Every minute";
  if (expression === "0 * * * *") return "Every hour";
  if (expression === "0 0 * * *") return "Every day at midnight";
  if (expression === "0 12 * * *") return "Every day at noon";
  if (expression === "0 0 * * 0") return "Every Sunday at midnight";
  if (expression === "0 0 1 * *") return "First day of every month at midnight";
  if (expression === "0 0 1 1 *") return "January 1st at midnight (yearly)";

  const parts: string[] = [];

  // Minute
  if (minute === "*") parts.push("every minute");
  else if (minute.startsWith("*/")) parts.push(`every ${minute.slice(2)} minutes`);
  else parts.push(`at minute ${minute}`);

  // Hour
  if (hour === "*") { /* covered by "every minute" */ }
  else if (hour.startsWith("*/")) parts.push(`every ${hour.slice(2)} hours`);
  else parts.push(`past hour ${hour}`);

  // Day of month
  if (dayOfMonth !== "*") {
    if (dayOfMonth.startsWith("*/")) parts.push(`every ${dayOfMonth.slice(2)} days`);
    else parts.push(`on day ${dayOfMonth}`);
  }

  // Month
  if (month !== "*") {
    const monthNum = parseInt(month, 10);
    if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
      parts.push(`in ${MONTH_NAMES[monthNum - 1]}`);
    } else {
      parts.push(`in month ${month}`);
    }
  }

  // Day of week
  if (dayOfWeek !== "*") {
    const dowNum = parseInt(dayOfWeek, 10) % 7;
    if (!isNaN(dowNum)) {
      parts.push(`on ${DAY_NAMES[dowNum]}s`);
    } else {
      parts.push(`on day-of-week ${dayOfWeek}`);
    }
  }

  return parts.length > 0 ? parts.join(", ") : "Unknown schedule";
}

// ─────────────────────────────────────────────────────────────────────────────
// Next Run Computation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the next run time after a given date for a cron expression.
 * Supports: *, exact numbers, *\/step, comma-separated lists (no ranges).
 * Returns null if the expression is invalid.
 */
export function getNextRunTime(expression: string, after?: Date): Date | null {
  const parsed = parseCron(expression);
  if (!parsed) return null;

  const base = after ?? new Date();
  // Start from next minute
  const start = new Date(base.getTime() + 60_000);
  start.setSeconds(0, 0);

  // Try up to 4 years (leap year tolerance)
  const limit = new Date(base.getTime() + 4 * 365 * 24 * 60 * 60 * 1000);

  let candidate = new Date(start);

  while (candidate < limit) {
    if (!matchField(parsed.month, candidate.getUTCMonth() + 1, 1, 12)) {
      // Advance to next month
      candidate = new Date(Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, 1));
      continue;
    }
    if (!matchField(parsed.dayOfMonth, candidate.getUTCDate(), 1, 31)) {
      candidate = new Date(Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth(), candidate.getUTCDate() + 1));
      continue;
    }
    if (!matchField(parsed.dayOfWeek, candidate.getUTCDay(), 0, 6)) {
      candidate = new Date(Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth(), candidate.getUTCDate() + 1));
      continue;
    }
    if (!matchField(parsed.hour, candidate.getUTCHours(), 0, 23)) {
      candidate = new Date(Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth(), candidate.getUTCDate(), candidate.getUTCHours() + 1));
      continue;
    }
    if (!matchField(parsed.minute, candidate.getUTCMinutes(), 0, 59)) {
      candidate = new Date(candidate.getTime() + 60_000);
      continue;
    }
    return candidate;
  }
  return null;
}

/**
 * Get the next N run times for a cron expression.
 */
export function getNextNRunTimes(expression: string, n: number, after?: Date): Date[] {
  const results: Date[] = [];
  let current = after ?? new Date();
  for (let i = 0; i < n; i++) {
    const next = getNextRunTime(expression, current);
    if (!next) break;
    results.push(next);
    current = next;
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schedule Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new workflow schedule.
 */
export function createSchedule(params: {
  id: string;
  workflowId: string;
  name: string;
  cronExpression: string;
  timezone?: TimeZone;
  expiresAt?: Date;
  maxRuns?: number;
  description?: string;
  tags?: string[];
}): WorkflowSchedule {
  const nextRunAt = getNextRunTime(params.cronExpression) ?? undefined;
  return {
    id: params.id,
    workflowId: params.workflowId,
    name: params.name,
    cronExpression: params.cronExpression,
    timezone: params.timezone ?? "UTC",
    status: "active",
    createdAt: new Date(),
    nextRunAt,
    expiresAt: params.expiresAt,
    maxRuns: params.maxRuns,
    description: params.description,
    tags: params.tags ?? [],
    runCount: 0,
  };
}

/**
 * Record a schedule run: updates runCount, lastRunAt, nextRunAt, checks expiry/maxRuns.
 */
export function recordScheduleRun(schedule: WorkflowSchedule, now?: Date): WorkflowSchedule {
  const ts = now ?? new Date();
  const runCount = schedule.runCount + 1;
  const nextRunAt = getNextRunTime(schedule.cronExpression, ts) ?? undefined;

  let status: ScheduleStatus = schedule.status;
  if (schedule.maxRuns !== undefined && runCount >= schedule.maxRuns) {
    status = "disabled";
  } else if (schedule.expiresAt && nextRunAt && nextRunAt > schedule.expiresAt) {
    status = "expired";
  }

  return { ...schedule, runCount, lastRunAt: ts, nextRunAt, status };
}

/**
 * Pause a schedule.
 */
export function pauseSchedule(schedule: WorkflowSchedule): WorkflowSchedule {
  return { ...schedule, status: "paused" };
}

/**
 * Resume a paused schedule.
 */
export function resumeSchedule(schedule: WorkflowSchedule, now?: Date): WorkflowSchedule {
  if (schedule.status !== "paused") return schedule;
  const nextRunAt = getNextRunTime(schedule.cronExpression, now ?? new Date()) ?? undefined;
  return { ...schedule, status: "active", nextRunAt };
}

/**
 * Check if a schedule is due to run (nextRunAt <= now).
 */
export function isScheduleDue(schedule: WorkflowSchedule, now?: Date): boolean {
  if (schedule.status !== "active") return false;
  if (!schedule.nextRunAt) return false;
  const ts = now ?? new Date();
  if (schedule.expiresAt && ts > schedule.expiresAt) return false;
  return schedule.nextRunAt <= ts;
}

/**
 * Get all schedules due to run.
 */
export function getDueSchedules(schedules: WorkflowSchedule[], now?: Date): WorkflowSchedule[] {
  return schedules.filter((s) => isScheduleDue(s, now));
}

// ─────────────────────────────────────────────────────────────────────────────
// Conflict Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detect schedule conflicts: two schedules that fire within N minutes of each other.
 */
export function detectScheduleConflicts(
  schedules: WorkflowSchedule[],
  windowMinutes = 5,
  lookAheadHours = 24
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const now = new Date();
  const lookAheadMs = lookAheadHours * 60 * 60 * 1000;
  const end = new Date(now.getTime() + lookAheadMs);

  // For each pair of schedules, check if they fire within windowMinutes
  for (let i = 0; i < schedules.length; i++) {
    for (let j = i + 1; j < schedules.length; j++) {
      const a = schedules[i];
      const b = schedules[j];
      if (a.workflowId === b.workflowId) continue; // skip same workflow

      const runsA = getNextNRunTimes(a.cronExpression, 50, now).filter((t) => t <= end);
      const runsB = getNextNRunTimes(b.cronExpression, 50, now).filter((t) => t <= end);

      let minOverlap = Infinity;
      for (const ta of runsA) {
        for (const tb of runsB) {
          const diff = Math.abs(ta.getTime() - tb.getTime()) / 60_000;
          if (diff < minOverlap) minOverlap = diff;
        }
      }

      if (minOverlap < windowMinutes) {
        conflicts.push({
          scheduleA: a.id,
          scheduleB: b.id,
          reason: `Schedules fire within ${minOverlap.toFixed(1)} minutes of each other`,
          overlapsWithinMinutes: minOverlap,
        });
      }
    }
  }
  return conflicts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Statistics
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute estimated runs per day for a cron expression.
 */
export function estimateRunsPerDay(expression: string): number {
  const runs = getNextNRunTimes(expression, 1440, new Date("2025-01-01T00:00:00Z"));
  const cutoff = new Date("2025-01-02T00:00:00Z");
  return runs.filter((t) => t < cutoff).length;
}

/**
 * Summarize a list of schedules.
 */
export function summarizeSchedules(schedules: WorkflowSchedule[]): {
  total: number;
  active: number;
  paused: number;
  disabled: number;
  expired: number;
  totalRuns: number;
} {
  let active = 0, paused = 0, disabled = 0, expired = 0, totalRuns = 0;
  for (const s of schedules) {
    if (s.status === "active") active++;
    else if (s.status === "paused") paused++;
    else if (s.status === "disabled") disabled++;
    else if (s.status === "expired") expired++;
    totalRuns += s.runCount;
  }
  return { total: schedules.length, active, paused, disabled, expired, totalRuns };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function validateField(name: string, value: string, min: number, max: number, errors: string[]): void {
  if (value === "*") return;

  // */step
  if (value.startsWith("*/")) {
    const step = parseInt(value.slice(2), 10);
    if (isNaN(step) || step < 1) {
      errors.push(`${name}: invalid step value "${value}"`);
    }
    return;
  }

  // Comma-separated list
  if (value.includes(",")) {
    for (const part of value.split(",")) {
      const num = parseInt(part, 10);
      if (isNaN(num) || num < min || num > max) {
        errors.push(`${name}: value "${part}" out of range [${min}-${max}]`);
      }
    }
    return;
  }

  // Range a-b
  if (value.includes("-")) {
    const [a, b] = value.split("-").map(Number);
    if (isNaN(a) || isNaN(b) || a < min || b > max || a > b) {
      errors.push(`${name}: invalid range "${value}" (expected ${min}-${max})`);
    }
    return;
  }

  // Single number
  const num = parseInt(value, 10);
  if (isNaN(num) || num < min || num > max) {
    errors.push(`${name}: value "${value}" out of range [${min}-${max}]`);
  }
}

function matchField(field: string, value: number, min: number, max: number): boolean {
  if (field === "*") return true;

  // */step
  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10);
    return (value - min) % step === 0;
  }

  // Comma-separated
  if (field.includes(",")) {
    return field.split(",").some((p) => {
      const n = parseInt(p, 10);
      // For dayOfWeek, 7 = 0 (Sunday)
      return n === value || (value === 0 && n === 7);
    });
  }

  // Range
  if (field.includes("-")) {
    const [a, b] = field.split("-").map(Number);
    return value >= a && value <= b;
  }

  // Single value
  const n = parseInt(field, 10);
  return n === value || (value === 0 && n === 7 && max === 6);
}
