import { describe, it, expect } from "vitest";
import {
  createEvent,
  updateEventStatus,
  tagEvent,
  parseCron,
  isValidCron,
  nextCronRun,
  nextNCronRuns,
  nextIntervalRun,
  isOnceDue,
  createDebounceState,
  recordDebounceCall,
  getDebounceFireTime,
  shouldFireDebounce,
  createThrottleState,
  recordThrottleCall,
  isThrottled,
  getThrottleWindowRemaining,
  recordRun,
  getSuccessRate,
  getAverageDuration,
  getRunsInWindow,
  getRecentRuns,
  getFailedRuns,
  getEventsByWorkflow,
  getEventsByStatus,
  getEventsByKind,
  getEventsByTag,
  getOverdueEvents,
  getDueEvents,
  computeNextRun,
  setNextRun,
  pauseEvents,
  resumeEvents,
  cancelEvents,
  computeSchedulerStats,
  summarizeEvent,
  type ScheduledEvent,
  type RunRecord,
  type IntervalTrigger,
  type OnceTrigger,
  type DebounceTrigger,
  type ThrottleTrigger,
} from "./event-scheduler";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000; // fixed epoch for tests

function makeEvent(overrides: Partial<ScheduledEvent> = {}): ScheduledEvent {
  return createEvent("e1", "wf1", "My Event", { kind: "manual" }, NOW, ...[] as never[]) as ScheduledEvent
    && {
      ...createEvent("e1", "wf1", "My Event", { kind: "manual" }, NOW),
      ...overrides,
    };
}

function run(success: boolean, runAt = NOW, durationMs = 100): RunRecord {
  return { eventId: "e1", runAt, durationMs, success };
}

// ─────────────────────────────────────────────────────────────────────────────
// createEvent
// ─────────────────────────────────────────────────────────────────────────────

describe("createEvent", () => {
  it("creates event with defaults", () => {
    const e = createEvent("e1", "wf1", "Test", { kind: "manual" }, NOW);
    expect(e.id).toBe("e1");
    expect(e.workflowId).toBe("wf1");
    expect(e.status).toBe("active");
    expect(e.runCount).toBe(0);
    expect(e.errorCount).toBe(0);
    expect(e.tags).toEqual([]);
  });
});

describe("updateEventStatus", () => {
  it("changes status immutably", () => {
    const e = createEvent("e1", "wf1", "Test", { kind: "manual" }, NOW);
    const paused = updateEventStatus(e, "paused", NOW + 1000);
    expect(paused.status).toBe("paused");
    expect(e.status).toBe("active");
  });
});

describe("tagEvent", () => {
  it("adds tags without duplicates", () => {
    const e = createEvent("e1", "wf1", "Test", { kind: "manual" }, NOW);
    const tagged = tagEvent(tagEvent(e, ["env:prod", "critical"]), ["env:prod", "billing"]);
    expect(tagged.tags).toEqual(["env:prod", "critical", "billing"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseCron
// ─────────────────────────────────────────────────────────────────────────────

describe("parseCron", () => {
  it("parses simple expression", () => {
    const result = parseCron("0 9 * * 1-5");
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.minute).toEqual([0]);
      expect(result.hour).toEqual([9]);
      expect(result.dow).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it("parses wildcard", () => {
    const result = parseCron("* * * * *");
    if (!("error" in result)) {
      expect(result.minute).toHaveLength(60);
      expect(result.hour).toHaveLength(24);
    }
  });

  it("parses step expression", () => {
    const result = parseCron("*/15 * * * *");
    if (!("error" in result)) {
      expect(result.minute).toEqual([0, 15, 30, 45]);
    }
  });

  it("parses comma-separated", () => {
    const result = parseCron("0 9,17 * * *");
    if (!("error" in result)) {
      expect(result.hour).toEqual([9, 17]);
    }
  });

  it("returns error for wrong field count", () => {
    const result = parseCron("0 9 *");
    expect("error" in result).toBe(true);
  });
});

describe("isValidCron", () => {
  it("returns true for valid expression", () => expect(isValidCron("0 0 * * *")).toBe(true));
  it("returns false for invalid", () => expect(isValidCron("bad")).toBe(false));
});

// ─────────────────────────────────────────────────────────────────────────────
// nextCronRun
// ─────────────────────────────────────────────────────────────────────────────

describe("nextCronRun", () => {
  it("returns a future time", () => {
    // "every minute"
    const next = nextCronRun("* * * * *", NOW);
    expect(next).toBeDefined();
    expect(next!).toBeGreaterThan(NOW);
  });

  it("is approximately 1 minute ahead for * * * * *", () => {
    const next = nextCronRun("* * * * *", NOW);
    expect(next! - NOW).toBeLessThanOrEqual(120_000);
  });

  it("returns undefined for invalid expression", () => {
    expect(nextCronRun("bad expr", NOW)).toBeUndefined();
  });

  it("respects hour constraint", () => {
    // midnight every day — next run should be well ahead
    const next = nextCronRun("0 0 * * *", NOW);
    expect(next).toBeDefined();
    const d = new Date(next!);
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
  });
});

describe("nextNCronRuns", () => {
  it("returns n consecutive runs", () => {
    const runs = nextNCronRuns("* * * * *", NOW, 5);
    expect(runs).toHaveLength(5);
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i]).toBeGreaterThan(runs[i - 1]);
    }
  });

  it("returns empty array for invalid cron", () => {
    expect(nextNCronRuns("bad", NOW, 3)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// nextIntervalRun
// ─────────────────────────────────────────────────────────────────────────────

describe("nextIntervalRun", () => {
  const trigger: IntervalTrigger = { kind: "interval", intervalMs: 60_000 };

  it("uses createdAt for first run", () => {
    const next = nextIntervalRun(trigger, undefined, NOW, 0);
    expect(next).toBe(NOW + 60_000);
  });

  it("uses lastRunAt for subsequent runs", () => {
    const next = nextIntervalRun(trigger, NOW + 60_000, NOW, 1);
    expect(next).toBe(NOW + 120_000);
  });

  it("returns undefined when maxRuns reached", () => {
    const t: IntervalTrigger = { kind: "interval", intervalMs: 60_000, maxRuns: 3 };
    expect(nextIntervalRun(t, NOW, NOW, 3)).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isOnceDue
// ─────────────────────────────────────────────────────────────────────────────

describe("isOnceDue", () => {
  const trigger: OnceTrigger = { kind: "once", runAt: NOW + 5000 };

  it("false before runAt", () => expect(isOnceDue(trigger, 0, NOW)).toBe(false));
  it("true at runAt", () => expect(isOnceDue(trigger, 0, NOW + 5000)).toBe(true));
  it("true after runAt", () => expect(isOnceDue(trigger, 0, NOW + 10000)).toBe(true));
  it("false after already ran", () => expect(isOnceDue(trigger, 1, NOW + 10000)).toBe(false));
});

// ─────────────────────────────────────────────────────────────────────────────
// Debounce
// ─────────────────────────────────────────────────────────────────────────────

describe("debounce", () => {
  const trigger: DebounceTrigger = { kind: "debounce", delayMs: 500 };

  it("creates initial state", () => {
    const state = createDebounceState("e1", NOW);
    expect(state.callCount).toBe(1);
    expect(state.lastCallAt).toBe(NOW);
  });

  it("records subsequent calls", () => {
    const s1 = createDebounceState("e1", NOW);
    const s2 = recordDebounceCall(s1, NOW + 200);
    expect(s2.callCount).toBe(2);
    expect(s2.lastCallAt).toBe(NOW + 200);
  });

  it("fire time is lastCallAt + delay", () => {
    const state = createDebounceState("e1", NOW);
    expect(getDebounceFireTime(state, trigger)).toBe(NOW + 500);
  });

  it("should fire after delay elapses", () => {
    const state = createDebounceState("e1", NOW);
    expect(shouldFireDebounce(state, trigger, NOW + 499)).toBe(false);
    expect(shouldFireDebounce(state, trigger, NOW + 500)).toBe(true);
  });

  it("reset delay on new call", () => {
    let state = createDebounceState("e1", NOW);
    state = recordDebounceCall(state, NOW + 400);
    // should not fire yet since lastCallAt reset
    expect(shouldFireDebounce(state, trigger, NOW + 500)).toBe(false);
    expect(shouldFireDebounce(state, trigger, NOW + 900)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Throttle
// ─────────────────────────────────────────────────────────────────────────────

describe("throttle", () => {
  const trigger: ThrottleTrigger = { kind: "throttle", windowMs: 1000, maxCalls: 3 };

  it("creates initial state", () => {
    const state = createThrottleState("e1", NOW);
    expect(state.callsInWindow).toBe(1);
  });

  it("not throttled below max", () => {
    let state = createThrottleState("e1", NOW);
    state = recordThrottleCall(state, trigger, NOW + 100);
    expect(isThrottled(state, trigger, NOW + 100)).toBe(false); // 2 calls
    state = recordThrottleCall(state, trigger, NOW + 200);
    expect(isThrottled(state, trigger, NOW + 200)).toBe(true); // 3 calls = at max
  });

  it("resets on new window", () => {
    let state = createThrottleState("e1", NOW);
    state = recordThrottleCall(state, trigger, NOW + 100);
    state = recordThrottleCall(state, trigger, NOW + 200);
    // Move to next window
    state = recordThrottleCall(state, trigger, NOW + 1001);
    expect(isThrottled(state, trigger, NOW + 1001)).toBe(false);
    expect(state.callsInWindow).toBe(1);
  });

  it("computes remaining window time", () => {
    const state = createThrottleState("e1", NOW);
    const remaining = getThrottleWindowRemaining(state, trigger, NOW + 300);
    expect(remaining).toBe(700);
  });

  it("returns 0 remaining after window expires", () => {
    const state = createThrottleState("e1", NOW);
    expect(getThrottleWindowRemaining(state, trigger, NOW + 2000)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Run History
// ─────────────────────────────────────────────────────────────────────────────

describe("recordRun", () => {
  it("increments runCount on success", () => {
    const e = createEvent("e1", "wf1", "T", { kind: "manual" }, NOW);
    const updated = recordRun(e, run(true));
    expect(updated.runCount).toBe(1);
    expect(updated.errorCount).toBe(0);
  });

  it("increments errorCount on failure", () => {
    const e = createEvent("e1", "wf1", "T", { kind: "manual" }, NOW);
    const updated = recordRun(e, run(false));
    expect(updated.errorCount).toBe(1);
  });

  it("marks once event as completed", () => {
    const e = createEvent("e1", "wf1", "T", { kind: "once", runAt: NOW }, NOW);
    const updated = recordRun(e, run(true));
    expect(updated.status).toBe("completed");
  });

  it("does not change status for non-once events", () => {
    const e = createEvent("e1", "wf1", "T", { kind: "manual" }, NOW);
    const updated = recordRun(e, run(true));
    expect(updated.status).toBe("active");
  });
});

describe("getSuccessRate", () => {
  it("returns 0 for empty", () => expect(getSuccessRate([])).toBe(0));
  it("computes correctly", () => {
    const runs = [run(true), run(true), run(false)];
    expect(getSuccessRate(runs)).toBeCloseTo(2 / 3);
  });
});

describe("getAverageDuration", () => {
  it("returns 0 for empty", () => expect(getAverageDuration([])).toBe(0));
  it("computes average", () => {
    const runs = [
      { eventId: "e1", runAt: NOW, durationMs: 100, success: true },
      { eventId: "e1", runAt: NOW, durationMs: 300, success: true },
    ];
    expect(getAverageDuration(runs)).toBe(200);
  });
});

describe("getRunsInWindow", () => {
  it("filters by time window", () => {
    const runs = [
      run(true, NOW + 100),
      run(true, NOW + 500),
      run(true, NOW + 1000),
    ];
    const filtered = getRunsInWindow(runs, NOW + 200, NOW + 800);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].runAt).toBe(NOW + 500);
  });
});

describe("getRecentRuns", () => {
  it("returns most recent n", () => {
    const runs = [run(true, NOW + 100), run(true, NOW + 300), run(true, NOW + 200)];
    const recent = getRecentRuns(runs, 2);
    expect(recent[0].runAt).toBe(NOW + 300);
    expect(recent[1].runAt).toBe(NOW + 200);
  });
});

describe("getFailedRuns", () => {
  it("returns only failures", () => {
    const runs = [run(true), run(false), run(false)];
    expect(getFailedRuns(runs)).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Event Filtering
// ─────────────────────────────────────────────────────────────────────────────

const EVENTS: ScheduledEvent[] = [
  { ...createEvent("e1", "wf1", "A", { kind: "cron", expression: "* * * * *" }, NOW), tags: ["billing"] },
  { ...createEvent("e2", "wf1", "B", { kind: "interval", intervalMs: 60_000 }, NOW), status: "paused", tags: [] },
  { ...createEvent("e3", "wf2", "C", { kind: "once", runAt: NOW + 5000 }, NOW), tags: ["billing"] },
  { ...createEvent("e4", "wf2", "D", { kind: "manual" }, NOW), status: "cancelled", tags: [] },
];

describe("getEventsByWorkflow", () => {
  it("filters by workflowId", () => {
    expect(getEventsByWorkflow(EVENTS, "wf1")).toHaveLength(2);
  });
});

describe("getEventsByStatus", () => {
  it("filters by status", () => {
    expect(getEventsByStatus(EVENTS, "paused")).toHaveLength(1);
    expect(getEventsByStatus(EVENTS, "active")).toHaveLength(2);
  });
});

describe("getEventsByKind", () => {
  it("filters by trigger kind", () => {
    expect(getEventsByKind(EVENTS, "cron")).toHaveLength(1);
    expect(getEventsByKind(EVENTS, "manual")).toHaveLength(1);
  });
});

describe("getEventsByTag", () => {
  it("filters by tag", () => {
    expect(getEventsByTag(EVENTS, "billing")).toHaveLength(2);
  });
});

describe("getOverdueEvents", () => {
  it("returns active events with past nextRunAt", () => {
    const events: ScheduledEvent[] = [
      { ...createEvent("e1", "wf1", "A", { kind: "interval", intervalMs: 1000 }, NOW), nextRunAt: NOW - 5000 },
      { ...createEvent("e2", "wf1", "B", { kind: "interval", intervalMs: 1000 }, NOW), nextRunAt: NOW + 5000 },
    ];
    expect(getOverdueEvents(events, NOW)).toHaveLength(1);
  });
});

describe("getDueEvents", () => {
  it("returns active events with nextRunAt <= now", () => {
    const events: ScheduledEvent[] = [
      { ...createEvent("e1", "wf1", "A", { kind: "interval", intervalMs: 1000 }, NOW), nextRunAt: NOW },
      { ...createEvent("e2", "wf1", "B", { kind: "interval", intervalMs: 1000 }, NOW), nextRunAt: NOW + 1000 },
    ];
    expect(getDueEvents(events, NOW)).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeNextRun / setNextRun
// ─────────────────────────────────────────────────────────────────────────────

describe("computeNextRun", () => {
  it("computes for interval trigger", () => {
    const e = createEvent("e1", "wf1", "T", { kind: "interval", intervalMs: 30_000 }, NOW);
    const next = computeNextRun(e, NOW);
    expect(next).toBe(NOW + 30_000);
  });

  it("computes for once trigger", () => {
    const e = createEvent("e1", "wf1", "T", { kind: "once", runAt: NOW + 99999 }, NOW);
    expect(computeNextRun(e, NOW)).toBe(NOW + 99999);
  });

  it("returns undefined for once after run", () => {
    const e = { ...createEvent("e1", "wf1", "T", { kind: "once", runAt: NOW }, NOW), runCount: 1 };
    expect(computeNextRun(e, NOW)).toBeUndefined();
  });

  it("returns undefined for manual trigger", () => {
    const e = createEvent("e1", "wf1", "T", { kind: "manual" }, NOW);
    expect(computeNextRun(e, NOW)).toBeUndefined();
  });
});

describe("setNextRun", () => {
  it("sets nextRunAt on event", () => {
    const e = createEvent("e1", "wf1", "T", { kind: "interval", intervalMs: 5000 }, NOW);
    const updated = setNextRun(e, NOW);
    expect(updated.nextRunAt).toBe(NOW + 5000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Batch Operations
// ─────────────────────────────────────────────────────────────────────────────

describe("pauseEvents", () => {
  it("pauses active events by id", () => {
    const result = pauseEvents(EVENTS, ["e1"], NOW);
    expect(result.find((e) => e.id === "e1")!.status).toBe("paused");
    expect(result.find((e) => e.id === "e3")!.status).toBe("active");
  });

  it("does not affect non-active events", () => {
    const result = pauseEvents(EVENTS, ["e2"], NOW); // already paused
    expect(result.find((e) => e.id === "e2")!.status).toBe("paused");
  });
});

describe("resumeEvents", () => {
  it("resumes paused events", () => {
    const result = resumeEvents(EVENTS, ["e2"], NOW);
    expect(result.find((e) => e.id === "e2")!.status).toBe("active");
  });

  it("does not affect active events", () => {
    const result = resumeEvents(EVENTS, ["e1"], NOW);
    expect(result.find((e) => e.id === "e1")!.status).toBe("active");
  });
});

describe("cancelEvents", () => {
  it("cancels active events", () => {
    const result = cancelEvents(EVENTS, ["e1"], NOW);
    expect(result.find((e) => e.id === "e1")!.status).toBe("cancelled");
  });

  it("cancels paused events", () => {
    const result = cancelEvents(EVENTS, ["e2"], NOW);
    expect(result.find((e) => e.id === "e2")!.status).toBe("cancelled");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeSchedulerStats
// ─────────────────────────────────────────────────────────────────────────────

describe("computeSchedulerStats", () => {
  it("counts totals correctly", () => {
    const stats = computeSchedulerStats(EVENTS, NOW);
    expect(stats.total).toBe(4);
    expect(stats.activeCount).toBe(2);
    expect(stats.byStatus.paused).toBe(1);
    expect(stats.byStatus.cancelled).toBe(1);
    expect(stats.byKind.cron).toBe(1);
    expect(stats.byKind.interval).toBe(1);
    expect(stats.byKind.once).toBe(1);
    expect(stats.byKind.manual).toBe(1);
  });

  it("computes success rate from runCount/errorCount", () => {
    const events: ScheduledEvent[] = [
      { ...createEvent("e1", "wf1", "A", { kind: "manual" }, NOW), runCount: 10, errorCount: 2 },
    ];
    const stats = computeSchedulerStats(events, NOW);
    expect(stats.overallSuccessRate).toBeCloseTo(0.8);
  });

  it("returns 0 success rate for no runs", () => {
    const stats = computeSchedulerStats(EVENTS, NOW);
    expect(stats.overallSuccessRate).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// summarizeEvent
// ─────────────────────────────────────────────────────────────────────────────

describe("summarizeEvent", () => {
  it("summarizes cron event", () => {
    const e = createEvent("e1", "wf1", "Daily Job", { kind: "cron", expression: "0 9 * * 1-5" }, NOW);
    const s = summarizeEvent(e);
    expect(s).toContain("ACTIVE");
    expect(s).toContain("Daily Job");
    expect(s).toContain("0 9 * * 1-5");
  });

  it("summarizes interval event", () => {
    const e = createEvent("e1", "wf1", "Poll", { kind: "interval", intervalMs: 30000 }, NOW);
    expect(summarizeEvent(e)).toContain("30000ms");
  });

  it("summarizes manual event", () => {
    const e = createEvent("e1", "wf1", "Manual", { kind: "manual" }, NOW);
    expect(summarizeEvent(e)).toContain("manual");
  });
});
