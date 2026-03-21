import { describe, it, expect } from "vitest";
import {
  computeWorkflowMetrics,
  buildTimeSeries,
  getTopFailingWorkflows,
  type ExecutionRecord,
} from "./workflow-metrics";

const makeRecord = (
  id: string,
  workflowId: string,
  status: ExecutionRecord["status"],
  startedAt: Date,
  completedAt?: Date,
): ExecutionRecord => ({ id, workflowId, status, startedAt, completedAt });

describe("Workflow Metrics", () => {
  describe("computeWorkflowMetrics", () => {
    const base = new Date("2024-01-01T00:00:00Z");

    const records: ExecutionRecord[] = [
      makeRecord("e1", "wf1", "SUCCESS", base, new Date(base.getTime() + 1000)),
      makeRecord("e2", "wf1", "SUCCESS", base, new Date(base.getTime() + 2000)),
      makeRecord("e3", "wf1", "FAILED", base, new Date(base.getTime() + 500)),
      makeRecord("e4", "wf1", "RUNNING", base),
      makeRecord("e5", "wf2", "SUCCESS", base),
    ];

    it("should count runs correctly", () => {
      const metrics = computeWorkflowMetrics("wf1", records);
      expect(metrics.totalRuns).toBe(4);
      expect(metrics.successCount).toBe(2);
      expect(metrics.failureCount).toBe(1);
      expect(metrics.runningCount).toBe(1);
    });

    it("should calculate success rate from completed only", () => {
      const metrics = computeWorkflowMetrics("wf1", records);
      // 2 success / 3 completed = 66.67% -> 67
      expect(metrics.successRate).toBe(67);
    });

    it("should calculate duration statistics", () => {
      const metrics = computeWorkflowMetrics("wf1", records);
      expect(metrics.minDurationMs).toBe(500);
      expect(metrics.maxDurationMs).toBe(2000);
      expect(metrics.avgDurationMs).toBe(Math.round((1000 + 2000 + 500) / 3));
    });

    it("should compute percentiles", () => {
      const metrics = computeWorkflowMetrics("wf1", records);
      expect(metrics.p50DurationMs).toBeDefined();
      expect(metrics.p95DurationMs).toBeDefined();
    });

    it("should return nulls for empty records", () => {
      const metrics = computeWorkflowMetrics("unknown", records);
      expect(metrics.totalRuns).toBe(0);
      expect(metrics.avgDurationMs).toBeNull();
      expect(metrics.lastRunAt).toBeNull();
      expect(metrics.lastStatus).toBeNull();
    });

    it("should return last run info", () => {
      const later = new Date(base.getTime() + 5000);
      const moreRecords = [
        ...records,
        makeRecord("e6", "wf1", "FAILED", later),
      ];
      const metrics = computeWorkflowMetrics("wf1", moreRecords);
      expect(metrics.lastStatus).toBe("FAILED");
      expect(metrics.lastRunAt?.getTime()).toBe(later.getTime());
    });

    it("should only count records for the given workflowId", () => {
      const metrics = computeWorkflowMetrics("wf2", records);
      expect(metrics.totalRuns).toBe(1);
    });
  });

  describe("buildTimeSeries", () => {
    it("should return the requested number of days", () => {
      const points = buildTimeSeries([], 7);
      expect(points.length).toBe(7);
    });

    it("should have dates in ascending order", () => {
      const points = buildTimeSeries([], 5);
      for (let i = 1; i < points.length; i++) {
        expect(points[i].date > points[i - 1].date).toBe(true);
      }
    });

    it("should count records per day", () => {
      // Use UTC noon to avoid timezone-shift issues with toISOString()
      const now = new Date();
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0));
      const records: ExecutionRecord[] = [
        makeRecord("e1", "wf1", "SUCCESS", today, new Date(today.getTime() + 1000)),
        makeRecord("e2", "wf1", "FAILED", today),
      ];
      const points = buildTimeSeries(records, 7);
      const todayPoint = points[points.length - 1];
      expect(todayPoint.runs).toBe(2);
      expect(todayPoint.successes).toBe(1);
      expect(todayPoint.failures).toBe(1);
    });

    it("should have null avgDuration for days with no completions", () => {
      const today = new Date();
      today.setHours(12, 0, 0, 0);
      const records: ExecutionRecord[] = [
        makeRecord("e1", "wf1", "RUNNING", today),
      ];
      const points = buildTimeSeries(records, 1);
      expect(points[0].avgDurationMs).toBeNull();
    });
  });

  describe("getTopFailingWorkflows", () => {
    const base = new Date();
    const records: ExecutionRecord[] = [
      makeRecord("e1", "wf1", "FAILED", base),
      makeRecord("e2", "wf1", "FAILED", base),
      makeRecord("e3", "wf1", "SUCCESS", base),
      makeRecord("e4", "wf2", "FAILED", base),
      makeRecord("e5", "wf3", "SUCCESS", base),
    ];

    it("should return workflows sorted by failure count", () => {
      const result = getTopFailingWorkflows(records);
      expect(result[0].workflowId).toBe("wf1");
      expect(result[0].failureCount).toBe(2);
      expect(result[1].workflowId).toBe("wf2");
    });

    it("should exclude workflows with no failures", () => {
      const result = getTopFailingWorkflows(records);
      expect(result.find((r) => r.workflowId === "wf3")).toBeUndefined();
    });

    it("should respect the limit", () => {
      const result = getTopFailingWorkflows(records, 1);
      expect(result.length).toBe(1);
    });

    it("should include success rate", () => {
      const result = getTopFailingWorkflows(records);
      const wf1 = result.find((r) => r.workflowId === "wf1");
      expect(wf1?.successRate).toBe(33); // 1/3
    });
  });
});
