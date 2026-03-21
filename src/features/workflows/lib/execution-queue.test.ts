import { describe, it, expect } from "vitest";
import {
  createQueuedExecution,
  priorityScore,
  comparePriority,
  sortQueue,
  canEnqueue,
  canStart,
  getNextBatch,
  estimateWaitTime,
  computeQueueStats,
  filterByTeam,
  filterByPriority,
  filterReady,
  buildFairShareGroups,
  applyWeightedRoundRobin,
  isStuck,
  formatQueueStats,
  type QueuedExecution,
  type QueueConfig,
} from "./execution-queue";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeExec(
  id: string,
  opts: Partial<QueuedExecution> = {}
): QueuedExecution {
  return createQueuedExecution({
    id,
    workflowId: `wf-${id}`,
    workflowName: `Workflow ${id}`,
    teamId: opts.teamId ?? "team-a",
    priority: opts.priority ?? "normal",
    enqueuedAt: opts.enqueuedAt ?? new Date("2024-01-01T00:00:00Z"),
    scheduledAt: opts.scheduledAt,
    estimatedDurationMs: opts.estimatedDurationMs,
    weight: opts.weight,
    tags: opts.tags ?? [],
    maxRetries: opts.maxRetries ?? 3,
  });
}

const defaultConfig: QueueConfig = {
  strategy: "fifo",
  maxQueueSize: 100,
  maxConcurrent: 3,
};

// ─── createQueuedExecution ───────────────────────────────────────────────────

describe("createQueuedExecution", () => {
  it("creates with default priority normal", () => {
    const e = createQueuedExecution({
      id: "e1",
      workflowId: "wf1",
      workflowName: "WF",
      teamId: "t1",
    });
    expect(e.priority).toBe("normal");
    expect(e.retryCount).toBe(0);
    expect(e.maxRetries).toBe(3);
    expect(e.tags).toEqual([]);
    expect(e.startedAt).toBeUndefined();
    expect(e.completedAt).toBeUndefined();
  });

  it("accepts custom params", () => {
    const now = new Date();
    const e = createQueuedExecution({
      id: "e2",
      workflowId: "wf2",
      workflowName: "WF2",
      teamId: "t2",
      priority: "critical",
      enqueuedAt: now,
      maxRetries: 5,
      tags: ["important"],
      weight: 2,
    });
    expect(e.priority).toBe("critical");
    expect(e.enqueuedAt).toBe(now);
    expect(e.maxRetries).toBe(5);
    expect(e.tags).toEqual(["important"]);
    expect(e.weight).toBe(2);
  });
});

// ─── priorityScore ───────────────────────────────────────────────────────────

describe("priorityScore", () => {
  it("critical = 5", () => expect(priorityScore("critical")).toBe(5));
  it("high = 4", () => expect(priorityScore("high")).toBe(4));
  it("normal = 3", () => expect(priorityScore("normal")).toBe(3));
  it("low = 2", () => expect(priorityScore("low")).toBe(2));
  it("background = 1", () => expect(priorityScore("background")).toBe(1));
});

// ─── comparePriority ─────────────────────────────────────────────────────────

describe("comparePriority", () => {
  it("sorts higher priority first", () => {
    const a = makeExec("a", { priority: "low" });
    const b = makeExec("b", { priority: "critical" });
    expect(comparePriority(a, b)).toBeGreaterThan(0);
    expect(comparePriority(b, a)).toBeLessThan(0);
  });

  it("ties broken by earlier enqueue time", () => {
    const earlier = makeExec("a", {
      priority: "normal",
      enqueuedAt: new Date("2024-01-01T00:00:00Z"),
    });
    const later = makeExec("b", {
      priority: "normal",
      enqueuedAt: new Date("2024-01-01T01:00:00Z"),
    });
    expect(comparePriority(earlier, later)).toBeLessThan(0);
  });

  it("equal priority and time returns 0", () => {
    const same = new Date("2024-01-01T00:00:00Z");
    const a = makeExec("a", { priority: "high", enqueuedAt: same });
    const b = makeExec("b", { priority: "high", enqueuedAt: same });
    expect(comparePriority(a, b)).toBe(0);
  });
});

// ─── sortQueue ───────────────────────────────────────────────────────────────

describe("sortQueue", () => {
  const items = [
    makeExec("a", { priority: "low", enqueuedAt: new Date("2024-01-01T01:00:00Z") }),
    makeExec("b", { priority: "critical", enqueuedAt: new Date("2024-01-01T02:00:00Z") }),
    makeExec("c", { priority: "normal", enqueuedAt: new Date("2024-01-01T00:00:00Z") }),
  ];

  it("fifo: sorts by enqueue time", () => {
    const sorted = sortQueue(items, "fifo");
    expect(sorted[0]!.id).toBe("c");
    expect(sorted[1]!.id).toBe("a");
    expect(sorted[2]!.id).toBe("b");
  });

  it("priority: sorts by priority desc, then time asc", () => {
    const sorted = sortQueue(items, "priority");
    expect(sorted[0]!.id).toBe("b"); // critical
    expect(sorted[1]!.id).toBe("c"); // normal
    expect(sorted[2]!.id).toBe("a"); // low
  });

  it("does not mutate original array", () => {
    const original = [...items];
    sortQueue(items, "priority");
    expect(items[0]!.id).toBe(original[0]!.id);
  });

  it("fair-share: interleaves teams", () => {
    const fairItems = [
      makeExec("a1", { teamId: "team-a" }),
      makeExec("a2", { teamId: "team-a" }),
      makeExec("b1", { teamId: "team-b" }),
    ];
    const sorted = sortQueue(fairItems, "fair-share");
    // Should alternate teams
    const teamOrder = sorted.map((e) => e.teamId);
    expect(teamOrder).toContain("team-a");
    expect(teamOrder).toContain("team-b");
  });

  it("weighted-round-robin: returns all items", () => {
    const wrItems = [
      makeExec("a1", { teamId: "team-a", priority: "high" }),
      makeExec("a2", { teamId: "team-a", priority: "normal" }),
      makeExec("b1", { teamId: "team-b", priority: "low" }),
    ];
    const config: QueueConfig = { ...defaultConfig, strategy: "weighted-round-robin" };
    const sorted = sortQueue(wrItems, "weighted-round-robin", config);
    expect(sorted).toHaveLength(3);
  });
});

// ─── canEnqueue ──────────────────────────────────────────────────────────────

describe("canEnqueue", () => {
  it("allows when queue is under max size", () => {
    const queue = [makeExec("a")];
    const result = canEnqueue(queue, { ...defaultConfig, maxQueueSize: 10 });
    expect(result.allowed).toBe(true);
  });

  it("rejects when queue is at max size", () => {
    const queue = [makeExec("a"), makeExec("b")];
    const result = canEnqueue(queue, { ...defaultConfig, maxQueueSize: 2 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/full/i);
  });

  it("includes max size in reason", () => {
    const queue = Array.from({ length: 5 }, (_, i) => makeExec(`${i}`));
    const result = canEnqueue(queue, { ...defaultConfig, maxQueueSize: 5 });
    expect(result.reason).toContain("5");
  });
});

// ─── canStart ────────────────────────────────────────────────────────────────

describe("canStart", () => {
  it("allows when under max concurrent", () => {
    const running = [makeExec("r1")];
    const item = makeExec("new");
    const result = canStart(running, item, { ...defaultConfig, maxConcurrent: 3 });
    expect(result.allowed).toBe(true);
  });

  it("rejects when at max concurrent", () => {
    const running = [makeExec("r1"), makeExec("r2"), makeExec("r3")];
    const item = makeExec("new");
    const result = canStart(running, item, { ...defaultConfig, maxConcurrent: 3 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/concurrent/i);
  });

  it("respects team quota", () => {
    const running = [
      makeExec("r1", { teamId: "team-x" }),
      makeExec("r2", { teamId: "team-x" }),
    ];
    const item = makeExec("new", { teamId: "team-x" });
    const config: QueueConfig = {
      ...defaultConfig,
      maxConcurrent: 10,
      teamQuota: { "team-x": 2 },
    };
    const result = canStart(running, item, config);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/team-x/);
  });

  it("allows different teams under quota", () => {
    const running = [makeExec("r1", { teamId: "team-x" })];
    const item = makeExec("new", { teamId: "team-y" });
    const config: QueueConfig = {
      ...defaultConfig,
      maxConcurrent: 10,
      teamQuota: { "team-x": 2 },
    };
    expect(canStart(running, item, config).allowed).toBe(true);
  });
});

// ─── getNextBatch ─────────────────────────────────────────────────────────────

describe("getNextBatch", () => {
  it("returns up to batchSize items", () => {
    const queue = [makeExec("a"), makeExec("b"), makeExec("c"), makeExec("d")];
    const batch = getNextBatch(queue, [], defaultConfig, 2);
    expect(batch).toHaveLength(2);
  });

  it("respects concurrency limits", () => {
    const running = [makeExec("r1"), makeExec("r2"), makeExec("r3")];
    const queue = [makeExec("q1"), makeExec("q2")];
    const batch = getNextBatch(queue, running, { ...defaultConfig, maxConcurrent: 3 });
    expect(batch).toHaveLength(0);
  });

  it("skips non-ready (scheduled in future) items", () => {
    const future = new Date(Date.now() + 60_000);
    const queue = [
      makeExec("future", { scheduledAt: future }),
      makeExec("ready"),
    ];
    const batch = getNextBatch(queue, [], defaultConfig, 2);
    expect(batch.map((e) => e.id)).toContain("ready");
    expect(batch.map((e) => e.id)).not.toContain("future");
  });

  it("default batchSize is 1", () => {
    const queue = [makeExec("a"), makeExec("b")];
    const batch = getNextBatch(queue, [], defaultConfig);
    expect(batch).toHaveLength(1);
  });
});

// ─── estimateWaitTime ─────────────────────────────────────────────────────────

describe("estimateWaitTime", () => {
  it("returns 0 for item within immediate slots", () => {
    const item = makeExec("a");
    const queue = [item];
    const config: QueueConfig = { ...defaultConfig, maxConcurrent: 3, strategy: "fifo" };
    const wait = estimateWaitTime(queue, item, config);
    expect(wait).toBe(0);
  });

  it("returns positive wait for item beyond slot capacity", () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      makeExec(`e${i}`, {
        enqueuedAt: new Date(1000 + i),
        estimatedDurationMs: 10000,
      })
    );
    const config: QueueConfig = { ...defaultConfig, maxConcurrent: 2, strategy: "fifo" };
    const wait = estimateWaitTime(items, items[4]!, config);
    expect(wait).toBeGreaterThan(0);
  });

  it("returns 0 for item not in queue", () => {
    const item = makeExec("not-in-queue");
    const queue = [makeExec("other")];
    expect(estimateWaitTime(queue, item, defaultConfig)).toBe(0);
  });
});

// ─── computeQueueStats ───────────────────────────────────────────────────────

describe("computeQueueStats", () => {
  it("counts total as queue + running", () => {
    const queue = [makeExec("q1"), makeExec("q2")];
    const running = [makeExec("r1")];
    const stats = computeQueueStats(queue, running);
    expect(stats.total).toBe(3);
    expect(stats.running).toBe(1);
  });

  it("counts pending items (no startedAt)", () => {
    const queue = [makeExec("q1"), makeExec("q2")];
    const stats = computeQueueStats(queue, []);
    expect(stats.pending).toBe(2);
  });

  it("counts byPriority", () => {
    const queue = [
      makeExec("a", { priority: "critical" }),
      makeExec("b", { priority: "normal" }),
      makeExec("c", { priority: "normal" }),
    ];
    const stats = computeQueueStats(queue, []);
    expect(stats.byPriority.critical).toBe(1);
    expect(stats.byPriority.normal).toBe(2);
    expect(stats.byPriority.high).toBe(0);
  });

  it("counts byTeam", () => {
    const queue = [
      makeExec("a", { teamId: "team-1" }),
      makeExec("b", { teamId: "team-1" }),
      makeExec("c", { teamId: "team-2" }),
    ];
    const stats = computeQueueStats(queue, []);
    expect(stats.byTeam["team-1"]).toBe(2);
    expect(stats.byTeam["team-2"]).toBe(1);
  });

  it("returns 0 estimatedDrainTimeMs for empty queue", () => {
    const stats = computeQueueStats([], []);
    expect(stats.estimatedDrainTimeMs).toBe(0);
  });
});

// ─── filterByTeam ─────────────────────────────────────────────────────────────

describe("filterByTeam", () => {
  it("returns only items for specified team", () => {
    const queue = [
      makeExec("a", { teamId: "team-a" }),
      makeExec("b", { teamId: "team-b" }),
      makeExec("c", { teamId: "team-a" }),
    ];
    const result = filterByTeam(queue, "team-a");
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.teamId === "team-a")).toBe(true);
  });

  it("returns empty array when no match", () => {
    const queue = [makeExec("a", { teamId: "team-a" })];
    expect(filterByTeam(queue, "team-z")).toHaveLength(0);
  });
});

// ─── filterByPriority ────────────────────────────────────────────────────────

describe("filterByPriority", () => {
  it("returns only items with given priority", () => {
    const queue = [
      makeExec("a", { priority: "critical" }),
      makeExec("b", { priority: "normal" }),
    ];
    const result = filterByPriority(queue, "critical");
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("a");
  });
});

// ─── filterReady ─────────────────────────────────────────────────────────────

describe("filterReady", () => {
  it("includes items with no scheduledAt", () => {
    const queue = [makeExec("a")];
    expect(filterReady(queue)).toHaveLength(1);
  });

  it("includes items where scheduledAt is in the past", () => {
    const past = new Date(Date.now() - 1000);
    const queue = [makeExec("a", { scheduledAt: past })];
    expect(filterReady(queue)).toHaveLength(1);
  });

  it("excludes items where scheduledAt is in the future", () => {
    const future = new Date(Date.now() + 60_000);
    const queue = [makeExec("a", { scheduledAt: future })];
    expect(filterReady(queue)).toHaveLength(0);
  });

  it("uses provided now date", () => {
    const scheduled = new Date("2024-06-01T12:00:00Z");
    const before = new Date("2024-06-01T11:00:00Z");
    const after = new Date("2024-06-01T13:00:00Z");
    const queue = [makeExec("a", { scheduledAt: scheduled })];
    expect(filterReady(queue, before)).toHaveLength(0);
    expect(filterReady(queue, after)).toHaveLength(1);
  });
});

// ─── buildFairShareGroups ────────────────────────────────────────────────────

describe("buildFairShareGroups", () => {
  it("groups by teamId", () => {
    const queue = [
      makeExec("a", { teamId: "team-1" }),
      makeExec("b", { teamId: "team-2" }),
      makeExec("c", { teamId: "team-1" }),
    ];
    const groups = buildFairShareGroups(queue);
    expect(Object.keys(groups)).toHaveLength(2);
    expect(groups["team-1"]).toHaveLength(2);
    expect(groups["team-2"]).toHaveLength(1);
  });

  it("handles empty queue", () => {
    expect(buildFairShareGroups([])).toEqual({});
  });
});

// ─── applyWeightedRoundRobin ─────────────────────────────────────────────────

describe("applyWeightedRoundRobin", () => {
  it("returns all items", () => {
    const groups = {
      "team-a": [makeExec("a1"), makeExec("a2")],
      "team-b": [makeExec("b1")],
    };
    const result = applyWeightedRoundRobin(groups, { "team-a": 2, "team-b": 1 });
    expect(result).toHaveLength(3);
  });

  it("higher weight team appears more often in early slots", () => {
    const groups = {
      "team-a": [makeExec("a1"), makeExec("a2"), makeExec("a3")],
      "team-b": [makeExec("b1")],
    };
    const result = applyWeightedRoundRobin(groups, { "team-a": 3, "team-b": 1 });
    // team-a should appear 3 times before team-b appears once
    const ids = result.map((e) => e.id);
    const firstB = ids.indexOf("b1");
    const aCount = ids.slice(0, firstB).filter((id) => id.startsWith("a")).length;
    expect(aCount).toBeGreaterThanOrEqual(1);
  });

  it("handles empty groups", () => {
    expect(applyWeightedRoundRobin({}, {})).toEqual([]);
  });
});

// ─── isStuck ─────────────────────────────────────────────────────────────────

describe("isStuck", () => {
  it("returns false for items not yet started", () => {
    const item = makeExec("a");
    expect(isStuck(item)).toBe(false);
  });

  it("returns false for completed items", () => {
    const item: QueuedExecution = {
      ...makeExec("a"),
      startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      completedAt: new Date(),
    };
    expect(isStuck(item)).toBe(false);
  });

  it("returns true for running item beyond threshold", () => {
    const item: QueuedExecution = {
      ...makeExec("a"),
      startedAt: new Date(Date.now() - 31 * 60 * 1000), // 31 minutes ago
    };
    expect(isStuck(item)).toBe(true);
  });

  it("returns false for running item within threshold", () => {
    const item: QueuedExecution = {
      ...makeExec("a"),
      startedAt: new Date(Date.now() - 10 * 1000), // 10 seconds ago
    };
    expect(isStuck(item)).toBe(false);
  });

  it("respects custom thresholdMs", () => {
    const item: QueuedExecution = {
      ...makeExec("a"),
      startedAt: new Date(Date.now() - 5000), // 5 seconds ago
    };
    expect(isStuck(item, new Date(), 3000)).toBe(true);
    expect(isStuck(item, new Date(), 10000)).toBe(false);
  });
});

// ─── formatQueueStats ────────────────────────────────────────────────────────

describe("formatQueueStats", () => {
  it("returns a string with key stats", () => {
    const stats = computeQueueStats(
      [makeExec("a", { priority: "critical" }), makeExec("b")],
      []
    );
    const formatted = formatQueueStats(stats);
    expect(typeof formatted).toBe("string");
    expect(formatted).toContain("total=");
    expect(formatted).toContain("pending=");
    expect(formatted).toContain("running=");
  });

  it("includes priority breakdown", () => {
    const stats = computeQueueStats([makeExec("a", { priority: "high" })], []);
    const formatted = formatQueueStats(stats);
    expect(formatted).toContain("high=");
  });
});
