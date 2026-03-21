import { describe, it, expect } from "vitest";
import {
  parseCronField,
  getNextRunTimes,
  buildCalendarView,
  groupIntoWeeks,
  getBusiestDay,
  countTotalRuns,
  type ScheduledWorkflow,
} from "./schedule-calendar";

describe("parseCronField", () => {
  it("parses wildcard *", () => {
    const result = parseCronField("*", 0, 4);
    expect(result).toEqual([0, 1, 2, 3, 4]);
  });

  it("parses step */15", () => {
    const result = parseCronField("*/15", 0, 59);
    expect(result).toEqual([0, 15, 30, 45]);
  });

  it("parses range 1-5", () => {
    const result = parseCronField("1-5", 0, 59);
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });

  it("parses list 1,3,5", () => {
    const result = parseCronField("1,3,5", 0, 59);
    expect(result).toEqual([1, 3, 5]);
  });

  it("parses single value", () => {
    const result = parseCronField("30", 0, 59);
    expect(result).toEqual([30]);
  });

  it("parses combination 0,15,30-35", () => {
    const result = parseCronField("0,15,30-32", 0, 59);
    expect(result).toEqual([0, 15, 30, 31, 32]);
  });
});

describe("getNextRunTimes", () => {
  it("returns correct count of run times", () => {
    const after = new Date("2026-01-01T00:00:00Z");
    const runs = getNextRunTimes("0 * * * *", after, 5); // hourly
    expect(runs).toHaveLength(5);
  });

  it("all runs are after the start date", () => {
    const after = new Date("2026-01-01T12:00:00Z");
    const runs = getNextRunTimes("*/30 * * * *", after, 10);
    for (const run of runs) {
      expect(run.getTime()).toBeGreaterThan(after.getTime());
    }
  });

  it("run times are in ascending order", () => {
    const after = new Date("2026-01-01T00:00:00Z");
    const runs = getNextRunTimes("*/5 * * * *", after, 10);
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i].getTime()).toBeGreaterThan(runs[i - 1].getTime());
    }
  });

  it("handles daily cron (0 9 * * *)", () => {
    const after = new Date("2026-01-01T08:00:00Z");
    const runs = getNextRunTimes("0 9 * * *", after, 3);
    expect(runs).toHaveLength(3);
    for (const run of runs) {
      expect(run.getHours()).toBe(9);
      expect(run.getMinutes()).toBe(0);
    }
  });

  it("returns empty for invalid cron", () => {
    const after = new Date();
    expect(getNextRunTimes("invalid", after, 5)).toEqual([]);
  });

  it("handles monthly cron (0 0 1 * *)", () => {
    const after = new Date("2026-01-01T00:00:00Z");
    const runs = getNextRunTimes("0 0 1 * *", after, 3);
    expect(runs).toHaveLength(3);
    for (const run of runs) {
      expect(run.getDate()).toBe(1);
    }
  });
});

describe("buildCalendarView", () => {
  const startDate = new Date("2026-01-05T00:00:00Z"); // Monday

  const workflows: ScheduledWorkflow[] = [
    {
      workflowId: "wf-1",
      workflowName: "Hourly WF",
      cronExpression: "0 * * * *", // every hour
      isActive: true,
    },
    {
      workflowId: "wf-2",
      workflowName: "Inactive WF",
      cronExpression: "*/5 * * * *",
      isActive: false,
    },
  ];

  it("returns correct number of days", () => {
    const calendar = buildCalendarView(workflows, startDate, 7);
    expect(calendar).toHaveLength(7);
  });

  it("includes runs for active workflows", () => {
    const calendar = buildCalendarView(workflows, startDate, 1);
    expect(calendar[0].runs.length).toBeGreaterThan(0);
  });

  it("excludes inactive workflows", () => {
    const calendar = buildCalendarView(workflows, startDate, 1);
    const inactiveRuns = calendar[0].runs.filter((r) => r.workflowId === "wf-2");
    expect(inactiveRuns).toHaveLength(0);
  });

  it("runs within each day are sorted by time", () => {
    const calendar = buildCalendarView(workflows, startDate, 1);
    const runs = calendar[0].runs;
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i].scheduledAt.getTime()).toBeGreaterThanOrEqual(runs[i - 1].scheduledAt.getTime());
    }
  });
});

describe("groupIntoWeeks", () => {
  it("groups 14 days into 2 weeks", () => {
    const startDate = new Date("2026-01-05T00:00:00Z");
    const calendar = buildCalendarView([], startDate, 14);
    const weeks = groupIntoWeeks(calendar);
    expect(weeks).toHaveLength(2);
    expect(weeks[0].days).toHaveLength(7);
    expect(weeks[1].days).toHaveLength(7);
  });

  it("handles partial last week", () => {
    const startDate = new Date("2026-01-05T00:00:00Z");
    const calendar = buildCalendarView([], startDate, 10);
    const weeks = groupIntoWeeks(calendar);
    expect(weeks).toHaveLength(2);
    expect(weeks[1].days).toHaveLength(3);
  });
});

describe("getBusiestDay", () => {
  it("returns null for empty calendar", () => {
    expect(getBusiestDay([])).toBeNull();
  });

  it("returns the day with most runs", () => {
    const startDate = new Date("2026-01-05T00:00:00Z");
    const workflows: ScheduledWorkflow[] = [
      { workflowId: "wf-1", workflowName: "Hourly", cronExpression: "0 * * * *", isActive: true },
    ];
    const calendar = buildCalendarView(workflows, startDate, 3);
    const busiest = getBusiestDay(calendar);
    expect(busiest).not.toBeNull();
    // All days should have 24 runs (hourly), so first one wins
    expect(busiest!.runs.length).toBeGreaterThan(0);
  });
});

describe("countTotalRuns", () => {
  it("returns 0 for empty calendar", () => {
    const startDate = new Date("2026-01-05T00:00:00Z");
    const calendar = buildCalendarView([], startDate, 3);
    expect(countTotalRuns(calendar)).toBe(0);
  });

  it("counts all runs across days", () => {
    const startDate = new Date("2026-01-05T00:00:00Z");
    const workflows: ScheduledWorkflow[] = [
      { workflowId: "wf-1", workflowName: "Daily", cronExpression: "0 9 * * *", isActive: true },
    ];
    const calendar = buildCalendarView(workflows, startDate, 7);
    expect(countTotalRuns(calendar)).toBe(7); // one run per day × 7 days
  });
});
