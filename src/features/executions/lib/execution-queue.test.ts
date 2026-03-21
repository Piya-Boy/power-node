import { describe, it, expect } from "vitest";
import {
  sortQueue,
  getReadyExecutions,
  getOverdueExecutions,
  deduplicateQueue,
  getQueueStats,
  canRetry,
  createRetry,
  type QueuedExecution,
} from "./execution-queue";

function makeExec(
  id: string,
  workflowId: string,
  priority: QueuedExecution["priority"],
  scheduledAt: Date,
  retryCount = 0,
  maxRetries = 3,
): QueuedExecution {
  return {
    id,
    workflowId,
    priority,
    scheduledAt,
    retryCount,
    maxRetries,
    tags: [],
  };
}

const past = new Date(Date.now() - 10_000);
const future = new Date(Date.now() + 10_000);
const veryOld = new Date(Date.now() - 120_000);

describe("Execution Queue", () => {
  describe("sortQueue", () => {
    it("should sort by priority descending", () => {
      const queue = [
        makeExec("e1", "wf1", "low", past),
        makeExec("e2", "wf2", "critical", past),
        makeExec("e3", "wf3", "normal", past),
      ];
      const sorted = sortQueue(queue);
      expect(sorted[0].priority).toBe("critical");
      expect(sorted[2].priority).toBe("low");
    });

    it("should sort by scheduledAt for same priority", () => {
      const earlier = new Date(Date.now() - 5000);
      const later = new Date(Date.now() - 2000);
      const queue = [
        makeExec("e2", "wf2", "normal", later),
        makeExec("e1", "wf1", "normal", earlier),
      ];
      const sorted = sortQueue(queue);
      expect(sorted[0].id).toBe("e1");
    });

    it("should not mutate original array", () => {
      const queue = [makeExec("e1", "wf1", "low", past)];
      const sorted = sortQueue(queue);
      expect(sorted).not.toBe(queue);
    });
  });

  describe("getReadyExecutions", () => {
    it("should return only past-due executions", () => {
      const queue = [
        makeExec("e1", "wf1", "normal", past),
        makeExec("e2", "wf2", "normal", future),
      ];
      const ready = getReadyExecutions(queue);
      expect(ready).toHaveLength(1);
      expect(ready[0].id).toBe("e1");
    });

    it("should return sorted by priority", () => {
      const queue = [
        makeExec("e1", "wf1", "low", past),
        makeExec("e2", "wf2", "critical", past),
      ];
      const ready = getReadyExecutions(queue);
      expect(ready[0].priority).toBe("critical");
    });
  });

  describe("getOverdueExecutions", () => {
    it("should return executions past threshold", () => {
      const queue = [
        makeExec("e1", "wf1", "normal", veryOld), // 120s ago, > 60s threshold
        makeExec("e2", "wf2", "normal", past),     // 10s ago, < 60s threshold
      ];
      const overdue = getOverdueExecutions(queue);
      expect(overdue).toHaveLength(1);
      expect(overdue[0].id).toBe("e1");
    });
  });

  describe("deduplicateQueue", () => {
    it("should keep highest priority execution per workflow", () => {
      const queue = [
        makeExec("e1", "wf1", "low", past),
        makeExec("e2", "wf1", "critical", future),
      ];
      const deduped = deduplicateQueue(queue);
      expect(deduped).toHaveLength(1);
      expect(deduped[0].priority).toBe("critical");
    });

    it("should keep earliest scheduled for same priority", () => {
      const earlier = new Date(Date.now() - 5000);
      const later = new Date(Date.now() - 2000);
      const queue = [
        makeExec("e2", "wf1", "normal", later),
        makeExec("e1", "wf1", "normal", earlier),
      ];
      const deduped = deduplicateQueue(queue);
      expect(deduped[0].id).toBe("e1");
    });

    it("should keep different workflows separate", () => {
      const queue = [
        makeExec("e1", "wf1", "normal", past),
        makeExec("e2", "wf2", "normal", past),
      ];
      expect(deduplicateQueue(queue)).toHaveLength(2);
    });
  });

  describe("getQueueStats", () => {
    it("should count by priority", () => {
      const queue = [
        makeExec("e1", "wf1", "high", past),
        makeExec("e2", "wf2", "high", past),
        makeExec("e3", "wf3", "critical", past),
      ];
      const stats = getQueueStats(queue);
      expect(stats.byPriority.high).toBe(2);
      expect(stats.byPriority.critical).toBe(1);
      expect(stats.total).toBe(3);
    });

    it("should count overdue and ready", () => {
      const queue = [
        makeExec("e1", "wf1", "normal", veryOld),
        makeExec("e2", "wf2", "normal", past),
        makeExec("e3", "wf3", "normal", future),
      ];
      const stats = getQueueStats(queue);
      expect(stats.readyToRun).toBe(2); // veryOld and past
      expect(stats.overdue).toBe(1); // only veryOld > 60s
    });
  });

  describe("canRetry", () => {
    it("should return true when retries remain", () => {
      expect(canRetry(makeExec("e1", "wf1", "normal", past, 1, 3))).toBe(true);
    });

    it("should return false when max retries reached", () => {
      expect(canRetry(makeExec("e1", "wf1", "normal", past, 3, 3))).toBe(false);
    });
  });

  describe("createRetry", () => {
    it("should create retry with incremented count", () => {
      const exec = makeExec("e1", "wf1", "normal", past, 1, 3);
      const retry = createRetry(exec, 5000);
      expect(retry?.retryCount).toBe(2);
      expect(retry?.id).toContain("retry2");
    });

    it("should schedule retry in the future", () => {
      const exec = makeExec("e1", "wf1", "normal", past, 0, 3);
      const retry = createRetry(exec, 5000);
      expect(retry?.scheduledAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("should return null when max retries reached", () => {
      const exec = makeExec("e1", "wf1", "normal", past, 3, 3);
      expect(createRetry(exec)).toBeNull();
    });
  });
});
