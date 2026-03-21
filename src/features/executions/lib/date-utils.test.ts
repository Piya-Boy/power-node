import { describe, it, expect } from "vitest";
import { addToDate, diffDates, formatDate, parseDate, isBetween, startOf, endOf, relativeTime } from "./date-utils";

describe("Date Utilities", () => {
  const base = new Date("2024-06-15T12:30:45.500Z");

  describe("addToDate", () => {
    it("should add seconds", () => {
      const result = addToDate(base, 30, "second");
      expect(result.getTime()).toBe(base.getTime() + 30_000);
    });

    it("should add minutes", () => {
      const result = addToDate(base, 5, "minute");
      expect(result.getTime()).toBe(base.getTime() + 5 * 60_000);
    });

    it("should add hours", () => {
      const result = addToDate(base, 2, "hour");
      expect(result.getTime()).toBe(base.getTime() + 2 * 3_600_000);
    });

    it("should add days", () => {
      const d = new Date("2024-01-15");
      expect(addToDate(d, 5, "day").getDate()).toBe(20);
    });

    it("should add weeks", () => {
      const d = new Date("2024-01-01");
      const result = addToDate(d, 2, "week");
      expect(result.getDate()).toBe(15);
    });

    it("should add months", () => {
      const d = new Date("2024-01-15");
      expect(addToDate(d, 3, "month").getMonth()).toBe(3); // April
    });

    it("should add years", () => {
      const d = new Date("2024-01-01");
      expect(addToDate(d, 2, "year").getFullYear()).toBe(2026);
    });

    it("should not mutate original", () => {
      const original = new Date(base);
      addToDate(base, 1, "day");
      expect(base.getTime()).toBe(original.getTime());
    });
  });

  describe("diffDates", () => {
    it("should calculate seconds diff", () => {
      const a = new Date("2024-01-01T00:00:00Z");
      const b = new Date("2024-01-01T00:01:00Z");
      expect(diffDates(a, b, "second")).toBe(60);
    });

    it("should calculate days diff", () => {
      const a = new Date("2024-01-01");
      const b = new Date("2024-01-08");
      expect(diffDates(a, b, "day")).toBe(7);
    });

    it("should return negative for past dates", () => {
      const a = new Date("2024-01-08");
      const b = new Date("2024-01-01");
      expect(diffDates(a, b, "day")).toBe(-7);
    });
  });

  describe("formatDate", () => {
    it("should format with YYYY-MM-DD pattern", () => {
      const d = new Date("2024-06-15T00:00:00Z");
      expect(formatDate(d, "YYYY-MM-DD", true)).toBe("2024-06-15");
    });

    it("should pad single digit months and days", () => {
      const d = new Date("2024-01-05T00:00:00Z");
      expect(formatDate(d, "YYYY-MM-DD", true)).toBe("2024-01-05");
    });

    it("should format time", () => {
      const d = new Date("2024-01-01T09:05:03.050Z");
      expect(formatDate(d, "HH:mm:ss.SSS", true)).toBe("09:05:03.050");
    });
  });

  describe("parseDate", () => {
    it("should parse ISO string", () => {
      const result = parseDate("2024-01-01T00:00:00Z");
      expect(result).toBeInstanceOf(Date);
    });

    it("should parse Date object", () => {
      const d = new Date();
      expect(parseDate(d)).toBe(d);
    });

    it("should parse unix timestamp", () => {
      expect(parseDate(1000000000000)).toBeInstanceOf(Date);
    });

    it("should return null for invalid string", () => {
      expect(parseDate("not-a-date")).toBeNull();
    });

    it("should return null for null input", () => {
      expect(parseDate(null)).toBeNull();
    });
  });

  describe("isBetween", () => {
    const start = new Date("2024-01-01");
    const end = new Date("2024-12-31");
    const mid = new Date("2024-06-15");

    it("should return true when date is between", () => {
      expect(isBetween(mid, start, end)).toBe(true);
    });

    it("should return true for boundary dates", () => {
      expect(isBetween(start, start, end)).toBe(true);
      expect(isBetween(end, start, end)).toBe(true);
    });

    it("should return false when outside range", () => {
      expect(isBetween(new Date("2023-12-31"), start, end)).toBe(false);
    });
  });

  describe("startOf", () => {
    it("should get start of day", () => {
      const d = new Date("2024-06-15T14:30:00");
      const s = startOf(d, "day");
      expect(s.getHours()).toBe(0);
      expect(s.getMinutes()).toBe(0);
      expect(s.getSeconds()).toBe(0);
    });

    it("should get start of month", () => {
      const d = new Date("2024-06-15");
      expect(startOf(d, "month").getDate()).toBe(1);
    });

    it("should get start of year", () => {
      const d = new Date("2024-06-15");
      const s = startOf(d, "year");
      expect(s.getMonth()).toBe(0);
      expect(s.getDate()).toBe(1);
    });
  });

  describe("endOf", () => {
    it("should get end of day", () => {
      const d = new Date("2024-06-15T10:00:00");
      const e = endOf(d, "day");
      expect(e.getHours()).toBe(23);
      expect(e.getMinutes()).toBe(59);
      expect(e.getSeconds()).toBe(59);
    });

    it("should get end of month", () => {
      const june = new Date("2024-06-10");
      const e = endOf(june, "month");
      expect(e.getDate()).toBe(30); // June has 30 days
    });
  });

  describe("relativeTime", () => {
    it("should return just now for < 1 minute", () => {
      const now = new Date();
      const d = new Date(now.getTime() - 30_000);
      expect(relativeTime(d, now)).toBe("just now");
    });

    it("should return minutes ago", () => {
      const now = new Date();
      const d = new Date(now.getTime() - 5 * 60_000);
      expect(relativeTime(d, now)).toContain("minutes ago");
    });

    it("should return future time", () => {
      const now = new Date();
      const d = new Date(now.getTime() + 3 * 86_400_000);
      expect(relativeTime(d, now)).toContain("in");
      expect(relativeTime(d, now)).toContain("days");
    });

    it("should use singular for 1 unit", () => {
      const now = new Date();
      const d = new Date(now.getTime() - 3_600_000);
      expect(relativeTime(d, now)).toContain("hour ago");
    });
  });
});
