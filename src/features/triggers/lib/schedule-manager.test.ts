import { describe, it, expect } from "vitest";
import {
  parseCron,
  validateCron,
  formatCron,
  describeCron,
  getNextRunTime,
  getNextNRunTimes,
  createSchedule,
  recordScheduleRun,
  pauseSchedule,
  resumeSchedule,
  isScheduleDue,
  getDueSchedules,
  estimateRunsPerDay,
  summarizeSchedules,
  type WorkflowSchedule,
} from "./schedule-manager";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeSchedule(overrides: Partial<WorkflowSchedule> = {}): WorkflowSchedule {
  return {
    id: "s1",
    workflowId: "wf1",
    name: "Daily Run",
    cronExpression: "0 9 * * *",
    timezone: "UTC",
    status: "active",
    createdAt: new Date("2025-01-01"),
    runCount: 0,
    tags: [],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// parseCron
// ─────────────────────────────────────────────────────────────────────────────

describe("parseCron", () => {
  it("parses a valid 5-field expression", () => {
    const parsed = parseCron("0 9 * * 1");
    expect(parsed).not.toBeNull();
    expect(parsed?.minute).toBe("0");
    expect(parsed?.hour).toBe("9");
    expect(parsed?.dayOfMonth).toBe("*");
    expect(parsed?.month).toBe("*");
    expect(parsed?.dayOfWeek).toBe("1");
  });

  it("returns null for wrong number of fields", () => {
    expect(parseCron("0 9 *")).toBeNull();
    expect(parseCron("0 9 * * * *")).toBeNull();
  });

  it("handles extra whitespace", () => {
    expect(parseCron("  0  9  *  *  *  ")).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateCron
// ─────────────────────────────────────────────────────────────────────────────

describe("validateCron", () => {
  it("accepts valid expressions", () => {
    expect(validateCron("0 9 * * *").valid).toBe(true);
    expect(validateCron("*/5 * * * *").valid).toBe(true);
    expect(validateCron("0 0 1 1 *").valid).toBe(true);
    expect(validateCron("0 12 * * 1,3,5").valid).toBe(true);
  });

  it("errors on invalid field count", () => {
    const result = validateCron("0 9 *");
    expect(result.errors).toContain("Cron expression must have exactly 5 fields");
  });

  it("errors on out-of-range minute", () => {
    const result = validateCron("60 9 * * *");
    expect(result.errors.some((e) => e.includes("minute"))).toBe(true);
  });

  it("errors on out-of-range hour", () => {
    const result = validateCron("0 24 * * *");
    expect(result.errors.some((e) => e.includes("hour"))).toBe(true);
  });

  it("errors on out-of-range month", () => {
    const result = validateCron("0 0 1 13 *");
    expect(result.errors.some((e) => e.includes("month"))).toBe(true);
  });

  it("warns on every-minute schedule", () => {
    const result = validateCron("* * * * *");
    expect(result.warnings.some((w) => w.includes("every minute"))).toBe(true);
  });

  it("warns on high-frequency schedule", () => {
    const result = validateCron("*/2 * * * *");
    expect(result.warnings.some((w) => w.includes("5 minutes"))).toBe(true);
  });

  it("returns parsed expression on success", () => {
    const result = validateCron("0 9 * * *");
    expect(result.parsed).toBeDefined();
    expect(result.parsed?.hour).toBe("9");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// formatCron
// ─────────────────────────────────────────────────────────────────────────────

describe("formatCron", () => {
  it("formats back to cron string", () => {
    const expr = { minute: "0", hour: "9", dayOfMonth: "*", month: "*", dayOfWeek: "1" };
    expect(formatCron(expr)).toBe("0 9 * * 1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// describeCron
// ─────────────────────────────────────────────────────────────────────────────

describe("describeCron", () => {
  it("describes every minute", () => {
    expect(describeCron("* * * * *")).toBe("Every minute");
  });

  it("describes every hour", () => {
    expect(describeCron("0 * * * *")).toBe("Every hour");
  });

  it("describes every day at midnight", () => {
    expect(describeCron("0 0 * * *")).toBe("Every day at midnight");
  });

  it("describes every day at noon", () => {
    expect(describeCron("0 12 * * *")).toBe("Every day at noon");
  });

  it("describes monthly", () => {
    expect(describeCron("0 0 1 * *")).toBe("First day of every month at midnight");
  });

  it("describes yearly", () => {
    expect(describeCron("0 0 1 1 *")).toBe("January 1st at midnight (yearly)");
  });

  it("describes weekly on Sunday", () => {
    expect(describeCron("0 0 * * 0")).toBe("Every Sunday at midnight");
  });

  it("returns Invalid for bad expression", () => {
    expect(describeCron("bad expr")).toBe("Invalid cron expression");
  });

  it("describes step minutes", () => {
    const desc = describeCron("*/15 * * * *");
    expect(desc).toContain("15");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getNextRunTime
// ─────────────────────────────────────────────────────────────────────────────

describe("getNextRunTime", () => {
  it("returns null for invalid expression", () => {
    expect(getNextRunTime("invalid")).toBeNull();
  });

  it("computes next run for daily schedule", () => {
    // "0 9 * * *" after 2025-01-01T08:00:00Z → 2025-01-01T09:00:00Z
    const next = getNextRunTime("0 9 * * *", new Date("2025-01-01T08:00:00Z"));
    expect(next?.toISOString()).toBe("2025-01-01T09:00:00.000Z");
  });

  it("advances to next day if current hour is past", () => {
    // "0 9 * * *" after 2025-01-01T10:00:00Z → 2025-01-02T09:00:00Z
    const next = getNextRunTime("0 9 * * *", new Date("2025-01-01T10:00:00Z"));
    expect(next?.toISOString()).toBe("2025-01-02T09:00:00.000Z");
  });

  it("computes next run for every-5-minutes schedule", () => {
    const next = getNextRunTime("*/5 * * * *", new Date("2025-01-01T09:00:00Z"));
    expect(next?.getUTCMinutes()).toBe(5);
    expect(next?.getUTCHours()).toBe(9);
  });

  it("computes next run for monthly schedule", () => {
    // "0 0 1 * *" after 2025-01-15 → 2025-02-01T00:00Z
    const next = getNextRunTime("0 0 1 * *", new Date("2025-01-15T00:00:00Z"));
    expect(next?.toISOString()).toBe("2025-02-01T00:00:00.000Z");
  });

  it("computes next run for specific day-of-week", () => {
    // "0 9 * * 1" (Monday at 9am) after Sunday 2025-01-05
    const next = getNextRunTime("0 9 * * 1", new Date("2025-01-05T09:00:00Z")); // Sunday
    // Next Monday is 2025-01-06
    expect(next?.toISOString()).toBe("2025-01-06T09:00:00.000Z");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getNextNRunTimes
// ─────────────────────────────────────────────────────────────────────────────

describe("getNextNRunTimes", () => {
  it("returns N sequential run times", () => {
    const times = getNextNRunTimes("0 9 * * *", 3, new Date("2025-01-01T08:00:00Z"));
    expect(times).toHaveLength(3);
    expect(times[0].toISOString()).toBe("2025-01-01T09:00:00.000Z");
    expect(times[1].toISOString()).toBe("2025-01-02T09:00:00.000Z");
    expect(times[2].toISOString()).toBe("2025-01-03T09:00:00.000Z");
  });

  it("returns empty for invalid expression", () => {
    expect(getNextNRunTimes("invalid", 3)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createSchedule
// ─────────────────────────────────────────────────────────────────────────────

describe("createSchedule", () => {
  it("creates active schedule with defaults", () => {
    const s = createSchedule({
      id: "s1", workflowId: "wf1", name: "Daily", cronExpression: "0 9 * * *",
    });
    expect(s.status).toBe("active");
    expect(s.timezone).toBe("UTC");
    expect(s.runCount).toBe(0);
    expect(s.tags).toEqual([]);
    expect(s.nextRunAt).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// recordScheduleRun
// ─────────────────────────────────────────────────────────────────────────────

describe("recordScheduleRun", () => {
  it("increments run count and updates timestamps", () => {
    const s = makeSchedule();
    const now = new Date("2025-01-01T09:00:00Z");
    const updated = recordScheduleRun(s, now);
    expect(updated.runCount).toBe(1);
    expect(updated.lastRunAt).toEqual(now);
    expect(updated.nextRunAt).toBeDefined();
  });

  it("disables schedule when maxRuns reached", () => {
    const s = makeSchedule({ runCount: 2, maxRuns: 3 });
    const updated = recordScheduleRun(s);
    expect(updated.status).toBe("disabled");
  });

  it("does not disable before maxRuns", () => {
    const s = makeSchedule({ runCount: 1, maxRuns: 3 });
    const updated = recordScheduleRun(s);
    expect(updated.status).toBe("active");
  });

  it("does not mutate original", () => {
    const s = makeSchedule({ runCount: 0 });
    recordScheduleRun(s);
    expect(s.runCount).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// pauseSchedule / resumeSchedule
// ─────────────────────────────────────────────────────────────────────────────

describe("pauseSchedule", () => {
  it("sets status to paused", () => {
    expect(pauseSchedule(makeSchedule()).status).toBe("paused");
  });

  it("does not mutate original", () => {
    const s = makeSchedule();
    pauseSchedule(s);
    expect(s.status).toBe("active");
  });
});

describe("resumeSchedule", () => {
  it("resumes a paused schedule", () => {
    const s = makeSchedule({ status: "paused" });
    const resumed = resumeSchedule(s, new Date("2025-01-01T08:00:00Z"));
    expect(resumed.status).toBe("active");
    expect(resumed.nextRunAt).toBeDefined();
  });

  it("does not change non-paused schedule", () => {
    const s = makeSchedule({ status: "disabled" });
    expect(resumeSchedule(s).status).toBe("disabled");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isScheduleDue / getDueSchedules
// ─────────────────────────────────────────────────────────────────────────────

describe("isScheduleDue", () => {
  it("returns true when nextRunAt is in the past", () => {
    const s = makeSchedule({ nextRunAt: new Date("2025-01-01T09:00:00Z") });
    expect(isScheduleDue(s, new Date("2025-01-01T10:00:00Z"))).toBe(true);
  });

  it("returns false when nextRunAt is in the future", () => {
    const s = makeSchedule({ nextRunAt: new Date("2025-01-01T11:00:00Z") });
    expect(isScheduleDue(s, new Date("2025-01-01T10:00:00Z"))).toBe(false);
  });

  it("returns false for paused schedule", () => {
    const s = makeSchedule({ status: "paused", nextRunAt: new Date("2025-01-01T09:00:00Z") });
    expect(isScheduleDue(s, new Date("2025-01-01T10:00:00Z"))).toBe(false);
  });

  it("returns false when expired", () => {
    const s = makeSchedule({
      nextRunAt: new Date("2025-01-01T09:00:00Z"),
      expiresAt: new Date("2025-01-01T08:00:00Z"),
    });
    expect(isScheduleDue(s, new Date("2025-01-01T10:00:00Z"))).toBe(false);
  });
});

describe("getDueSchedules", () => {
  it("returns all due schedules", () => {
    const now = new Date("2025-01-01T10:00:00Z");
    const schedules = [
      makeSchedule({ id: "s1", nextRunAt: new Date("2025-01-01T09:00:00Z") }),
      makeSchedule({ id: "s2", nextRunAt: new Date("2025-01-01T11:00:00Z") }),
      makeSchedule({ id: "s3", nextRunAt: new Date("2025-01-01T08:00:00Z") }),
    ];
    const due = getDueSchedules(schedules, now);
    expect(due.map((s) => s.id)).toContain("s1");
    expect(due.map((s) => s.id)).toContain("s3");
    expect(due.map((s) => s.id)).not.toContain("s2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// estimateRunsPerDay
// ─────────────────────────────────────────────────────────────────────────────

describe("estimateRunsPerDay", () => {
  it("estimates 1 run/day for daily schedule", () => {
    expect(estimateRunsPerDay("0 9 * * *")).toBe(1);
  });

  it("estimates ~24 runs/day for hourly schedule", () => {
    // Starting from midnight, next run is 01:00 so we get 23 runs (1:00-23:00)
    expect(estimateRunsPerDay("0 * * * *")).toBe(23);
  });

  it("estimates ~288 runs/day for every-5-minute schedule", () => {
    // Starting from midnight, first run is 00:05, last is 23:55 → 287 runs
    expect(estimateRunsPerDay("*/5 * * * *")).toBe(287);
  });

  it("estimates 0 for monthly on day 15 when checking Jan 1", () => {
    // Jan 2 is not the 15th
    expect(estimateRunsPerDay("0 0 15 * *")).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// summarizeSchedules
// ─────────────────────────────────────────────────────────────────────────────

describe("summarizeSchedules", () => {
  it("returns zeroes for empty list", () => {
    const s = summarizeSchedules([]);
    expect(s.total).toBe(0);
    expect(s.active).toBe(0);
  });

  it("counts by status and sums runs", () => {
    const schedules = [
      makeSchedule({ id: "s1", status: "active", runCount: 10 }),
      makeSchedule({ id: "s2", status: "paused", runCount: 5 }),
      makeSchedule({ id: "s3", status: "disabled", runCount: 3 }),
      makeSchedule({ id: "s4", status: "active", runCount: 7 }),
    ];
    const summary = summarizeSchedules(schedules);
    expect(summary.total).toBe(4);
    expect(summary.active).toBe(2);
    expect(summary.paused).toBe(1);
    expect(summary.disabled).toBe(1);
    expect(summary.totalRuns).toBe(25);
  });
});
