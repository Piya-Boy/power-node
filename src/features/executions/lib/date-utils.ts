/**
 * Date/Time utilities for the DateTime node and workflow scheduling.
 * Uses native Date APIs only (no external library dependency).
 */

export type DateUnit = "second" | "minute" | "hour" | "day" | "week" | "month" | "year";

/**
 * Add a duration to a date.
 */
export function addToDate(date: Date, amount: number, unit: DateUnit): Date {
  const result = new Date(date);
  switch (unit) {
    case "second":
      result.setSeconds(result.getSeconds() + amount);
      break;
    case "minute":
      result.setMinutes(result.getMinutes() + amount);
      break;
    case "hour":
      result.setHours(result.getHours() + amount);
      break;
    case "day":
      result.setDate(result.getDate() + amount);
      break;
    case "week":
      result.setDate(result.getDate() + amount * 7);
      break;
    case "month":
      result.setMonth(result.getMonth() + amount);
      break;
    case "year":
      result.setFullYear(result.getFullYear() + amount);
      break;
  }
  return result;
}

/**
 * Get the difference between two dates in a specific unit.
 */
export function diffDates(from: Date, to: Date, unit: DateUnit): number {
  const msPerUnit: Record<DateUnit, number> = {
    second: 1000,
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
    week: 604_800_000,
    month: 2_628_000_000, // ~30.44 days
    year: 31_536_000_000, // 365 days
  };
  return Math.round((to.getTime() - from.getTime()) / msPerUnit[unit]);
}

/**
 * Format a date using a simple pattern.
 * Supported tokens: YYYY, MM, DD, HH, mm, ss, SSS
 */
export function formatDate(date: Date, pattern: string, utc: boolean = false): string {
  const get = utc
    ? {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        hours: date.getUTCHours(),
        minutes: date.getUTCMinutes(),
        seconds: date.getUTCSeconds(),
        ms: date.getUTCMilliseconds(),
      }
    : {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
        hours: date.getHours(),
        minutes: date.getMinutes(),
        seconds: date.getSeconds(),
        ms: date.getMilliseconds(),
      };

  return pattern
    .replace("YYYY", String(get.year))
    .replace("MM", String(get.month).padStart(2, "0"))
    .replace("DD", String(get.day).padStart(2, "0"))
    .replace("HH", String(get.hours).padStart(2, "0"))
    .replace("mm", String(get.minutes).padStart(2, "0"))
    .replace("ss", String(get.seconds).padStart(2, "0"))
    .replace("SSS", String(get.ms).padStart(3, "0"));
}

/**
 * Parse a date from various input formats.
 */
export function parseDate(input: unknown): Date | null {
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  if (typeof input === "number") return new Date(input);
  if (typeof input === "string") {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Check if a date is between two other dates.
 */
export function isBetween(date: Date, start: Date, end: Date): boolean {
  const t = date.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

/**
 * Get the start of a time unit (day, week, month, year).
 */
export function startOf(date: Date, unit: "day" | "week" | "month" | "year"): Date {
  const result = new Date(date);
  switch (unit) {
    case "day":
      result.setHours(0, 0, 0, 0);
      break;
    case "week":
      result.setHours(0, 0, 0, 0);
      result.setDate(result.getDate() - result.getDay());
      break;
    case "month":
      result.setDate(1);
      result.setHours(0, 0, 0, 0);
      break;
    case "year":
      result.setMonth(0, 1);
      result.setHours(0, 0, 0, 0);
      break;
  }
  return result;
}

/**
 * Get the end of a time unit.
 */
export function endOf(date: Date, unit: "day" | "week" | "month" | "year"): Date {
  const result = new Date(date);
  switch (unit) {
    case "day":
      result.setHours(23, 59, 59, 999);
      break;
    case "week":
      result.setHours(23, 59, 59, 999);
      result.setDate(result.getDate() + (6 - result.getDay()));
      break;
    case "month":
      result.setMonth(result.getMonth() + 1, 0);
      result.setHours(23, 59, 59, 999);
      break;
    case "year":
      result.setMonth(11, 31);
      result.setHours(23, 59, 59, 999);
      break;
  }
  return result;
}

/**
 * Get a human-readable relative time string ("2 hours ago", "in 3 days").
 */
export function relativeTime(date: Date, from: Date = new Date()): string {
  const diffMs = date.getTime() - from.getTime();
  const absDiff = Math.abs(diffMs);
  const isPast = diffMs < 0;

  const units: Array<[number, string]> = [
    [60_000, "minute"],
    [3_600_000, "hour"],
    [86_400_000, "day"],
    [604_800_000, "week"],
    [2_628_000_000, "month"],
    [31_536_000_000, "year"],
  ];

  if (absDiff < 60_000) return "just now";

  for (let i = units.length - 1; i >= 0; i--) {
    const [threshold, label] = units[i];
    if (absDiff >= threshold) {
      const count = Math.round(absDiff / threshold);
      const plural = count !== 1 ? `${label}s` : label;
      return isPast ? `${count} ${plural} ago` : `in ${count} ${plural}`;
    }
  }

  return "just now";
}
