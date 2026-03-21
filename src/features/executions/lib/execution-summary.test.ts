import { describe, it, expect } from "vitest";
import {
  calculateDuration,
  formatDuration,
  getStatusColor,
  getStatusIcon,
  summarizeExecutions,
} from "./execution-summary";

describe("Execution Summary", () => {
  describe("calculateDuration", () => {
    it("should calculate duration between two dates", () => {
      const start = new Date("2024-01-01T00:00:00Z");
      const end = new Date("2024-01-01T00:00:05Z");
      expect(calculateDuration(start, end)).toBe(5000);
    });

    it("should return null when no completion date", () => {
      expect(calculateDuration(new Date(), null)).toBeNull();
      expect(calculateDuration(new Date(), undefined)).toBeNull();
    });
  });

  describe("formatDuration", () => {
    it("should format milliseconds", () => {
      expect(formatDuration(500)).toBe("500ms");
    });

    it("should format seconds", () => {
      expect(formatDuration(2500)).toBe("2.5s");
    });

    it("should format minutes", () => {
      expect(formatDuration(125000)).toBe("2m 5s");
    });

    it("should show Running for null", () => {
      expect(formatDuration(null)).toBe("Running...");
    });
  });

  describe("getStatusColor", () => {
    it("should return green for SUCCESS", () => {
      expect(getStatusColor("SUCCESS")).toContain("green");
    });

    it("should return red for FAILED", () => {
      expect(getStatusColor("FAILED")).toContain("red");
    });

    it("should return blue for RUNNING", () => {
      expect(getStatusColor("RUNNING")).toContain("blue");
    });
  });

  describe("getStatusIcon", () => {
    it("should return check for SUCCESS", () => {
      expect(getStatusIcon("SUCCESS")).toBe("✓");
    });

    it("should return cross for FAILED", () => {
      expect(getStatusIcon("FAILED")).toBe("✗");
    });

    it("should return spinner for RUNNING", () => {
      expect(getStatusIcon("RUNNING")).toBe("⟳");
    });
  });

  describe("summarizeExecutions", () => {
    it("should handle empty executions", () => {
      const summary = summarizeExecutions([]);
      expect(summary.total).toBe(0);
      expect(summary.successRate).toBe(0);
      expect(summary.avgDuration).toBeNull();
    });

    it("should calculate correct counts", () => {
      const executions = [
        { status: "SUCCESS" as const, startedAt: new Date("2024-01-01T00:00:00Z"), completedAt: new Date("2024-01-01T00:00:02Z") },
        { status: "SUCCESS" as const, startedAt: new Date("2024-01-01T00:00:00Z"), completedAt: new Date("2024-01-01T00:00:04Z") },
        { status: "FAILED" as const, startedAt: new Date("2024-01-01T00:00:00Z"), completedAt: new Date("2024-01-01T00:00:01Z") },
        { status: "RUNNING" as const, startedAt: new Date("2024-01-01T00:00:00Z") },
      ];

      const summary = summarizeExecutions(executions);
      expect(summary.total).toBe(4);
      expect(summary.success).toBe(2);
      expect(summary.failed).toBe(1);
      expect(summary.running).toBe(1);
    });

    it("should calculate success rate from completed only", () => {
      const executions = [
        { status: "SUCCESS" as const, startedAt: new Date(), completedAt: new Date() },
        { status: "FAILED" as const, startedAt: new Date(), completedAt: new Date() },
        { status: "RUNNING" as const, startedAt: new Date() },
      ];
      // 1 success out of 2 completed = 50%
      expect(summarizeExecutions(executions).successRate).toBe(50);
    });

    it("should calculate average duration excluding running", () => {
      const base = new Date("2024-01-01T00:00:00Z");
      const executions = [
        { status: "SUCCESS" as const, startedAt: base, completedAt: new Date(base.getTime() + 2000) },
        { status: "SUCCESS" as const, startedAt: base, completedAt: new Date(base.getTime() + 4000) },
        { status: "RUNNING" as const, startedAt: base },
      ];
      // avg of 2000 and 4000 = 3000
      expect(summarizeExecutions(executions).avgDuration).toBe(3000);
    });

    it("should handle 100% success rate", () => {
      const executions = [
        { status: "SUCCESS" as const, startedAt: new Date(), completedAt: new Date() },
        { status: "SUCCESS" as const, startedAt: new Date(), completedAt: new Date() },
      ];
      expect(summarizeExecutions(executions).successRate).toBe(100);
    });
  });
});
