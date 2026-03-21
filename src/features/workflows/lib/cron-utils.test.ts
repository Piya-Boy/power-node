import { describe, it, expect } from "vitest";
import { isValidCron, describeCron, cronPresets, getNextRuns } from "./cron-utils";

describe("Cron Utilities", () => {
  describe("isValidCron", () => {
    it("should accept valid expressions", () => {
      expect(isValidCron("* * * * *")).toBe(true);
      expect(isValidCron("0 * * * *")).toBe(true);
      expect(isValidCron("*/5 * * * *")).toBe(true);
      expect(isValidCron("0 0 * * *")).toBe(true);
      expect(isValidCron("0 9 * * 1-5")).toBe(true);
      expect(isValidCron("0 0 1 * *")).toBe(true);
      expect(isValidCron("30 4 1,15 * *")).toBe(true);
    });

    it("should reject invalid expressions", () => {
      expect(isValidCron("")).toBe(false);
      expect(isValidCron("* *")).toBe(false); // too few fields
      expect(isValidCron("* * * * * *")).toBe(false); // too many fields
      expect(isValidCron("60 * * * *")).toBe(false); // minute > 59
      expect(isValidCron("* 25 * * *")).toBe(false); // hour > 23
      expect(isValidCron("* * 0 * *")).toBe(false); // day 0
      expect(isValidCron("* * * 13 *")).toBe(false); // month > 12
    });

    it("should accept ranges", () => {
      expect(isValidCron("0-30 * * * *")).toBe(true);
      expect(isValidCron("* 9-17 * * *")).toBe(true);
    });

    it("should accept step values", () => {
      expect(isValidCron("*/5 * * * *")).toBe(true);
      expect(isValidCron("0-30/5 * * * *")).toBe(true);
    });

    it("should accept lists", () => {
      expect(isValidCron("0,15,30,45 * * * *")).toBe(true);
      expect(isValidCron("* * * * 1,3,5")).toBe(true);
    });

    it("should reject invalid step values", () => {
      expect(isValidCron("*/0 * * * *")).toBe(false);
      expect(isValidCron("*/abc * * * *")).toBe(false);
    });
  });

  describe("describeCron", () => {
    it("should describe preset expressions", () => {
      expect(describeCron("* * * * *")).toBe("Runs every minute");
      expect(describeCron("0 0 * * *")).toBe("Runs daily at 00:00");
      expect(describeCron("0 0 * * 1")).toBe("Runs every Monday at 00:00");
    });

    it("should describe custom expressions", () => {
      expect(describeCron("*/10 * * * *")).toContain("10 minutes");
      expect(describeCron("30 14 * * *")).toContain("14:30");
    });

    it("should return error for invalid expressions", () => {
      expect(describeCron("invalid")).toBe("Invalid cron expression");
    });
  });

  describe("cronPresets", () => {
    it("should have all valid expressions", () => {
      for (const preset of cronPresets) {
        expect(isValidCron(preset.expression), `Preset "${preset.label}" has invalid expression: ${preset.expression}`).toBe(true);
      }
    });

    it("should have unique labels", () => {
      const labels = cronPresets.map((p) => p.label);
      expect(new Set(labels).size).toBe(labels.length);
    });

    it("should have at least 10 presets", () => {
      expect(cronPresets.length).toBeGreaterThanOrEqual(10);
    });
  });

  describe("getNextRuns", () => {
    it("should return requested number of runs", () => {
      const runs = getNextRuns("* * * * *", 3);
      expect(runs.length).toBe(3);
    });

    it("should return dates in ascending order", () => {
      const runs = getNextRuns("* * * * *", 5);
      for (let i = 1; i < runs.length; i++) {
        expect(runs[i].getTime()).toBeGreaterThan(runs[i - 1].getTime());
      }
    });

    it("should return empty for invalid expression", () => {
      expect(getNextRuns("invalid")).toEqual([]);
    });

    it("should return future dates only", () => {
      const now = Date.now();
      const runs = getNextRuns("*/5 * * * *", 3);
      for (const run of runs) {
        expect(run.getTime()).toBeGreaterThan(now);
      }
    });
  });
});
