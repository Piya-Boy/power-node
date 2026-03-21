/**
 * Cron expression utilities for the Schedule Trigger node.
 * Format: minute hour day-of-month month day-of-week
 */

export interface CronPreset {
  label: string;
  description: string;
  expression: string;
}

export const cronPresets: CronPreset[] = [
  { label: "Every minute", description: "Runs every minute", expression: "* * * * *" },
  { label: "Every 5 minutes", description: "Runs every 5 minutes", expression: "*/5 * * * *" },
  { label: "Every 15 minutes", description: "Runs every 15 minutes", expression: "*/15 * * * *" },
  { label: "Every 30 minutes", description: "Runs every 30 minutes", expression: "*/30 * * * *" },
  { label: "Every hour", description: "Runs at the start of every hour", expression: "0 * * * *" },
  { label: "Every 6 hours", description: "Runs every 6 hours", expression: "0 */6 * * *" },
  { label: "Every day at midnight", description: "Runs daily at 00:00", expression: "0 0 * * *" },
  { label: "Every day at noon", description: "Runs daily at 12:00", expression: "0 12 * * *" },
  { label: "Every Monday", description: "Runs every Monday at 00:00", expression: "0 0 * * 1" },
  { label: "Every weekday", description: "Runs Mon-Fri at 09:00", expression: "0 9 * * 1-5" },
  { label: "First of month", description: "Runs on the 1st of every month at 00:00", expression: "0 0 1 * *" },
];

export function isValidCron(expression: string): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const ranges = [
    { min: 0, max: 59 },  // minute
    { min: 0, max: 23 },  // hour
    { min: 1, max: 31 },  // day of month
    { min: 1, max: 12 },  // month
    { min: 0, max: 7 },   // day of week (0 and 7 are Sunday)
  ];

  for (let i = 0; i < 5; i++) {
    if (!isValidCronField(parts[i], ranges[i].min, ranges[i].max)) {
      return false;
    }
  }

  return true;
}

function isValidCronField(field: string, min: number, max: number): boolean {
  // Handle wildcard
  if (field === "*") return true;

  // Handle step values: */5, 1-10/2
  if (field.includes("/")) {
    const [range, step] = field.split("/");
    if (!step || isNaN(Number(step)) || Number(step) < 1) return false;
    if (range === "*") return true;
    return isValidCronField(range, min, max);
  }

  // Handle ranges: 1-5
  if (field.includes("-")) {
    const [start, end] = field.split("-");
    const s = Number(start);
    const e = Number(end);
    return !isNaN(s) && !isNaN(e) && s >= min && e <= max && s <= e;
  }

  // Handle lists: 1,3,5
  if (field.includes(",")) {
    return field.split(",").every((part) => isValidCronField(part, min, max));
  }

  // Handle single value
  const num = Number(field);
  return !isNaN(num) && num >= min && num <= max;
}

export function describeCron(expression: string): string {
  if (!isValidCron(expression)) return "Invalid cron expression";

  // Check against presets first
  const preset = cronPresets.find((p) => p.expression === expression);
  if (preset) return preset.description;

  const parts = expression.trim().split(/\s+/);
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  const segments: string[] = [];

  if (minute === "*" && hour === "*") {
    segments.push("Every minute");
  } else if (minute.startsWith("*/")) {
    segments.push(`Every ${minute.slice(2)} minutes`);
  } else if (hour === "*") {
    segments.push(`At minute ${minute} of every hour`);
  } else if (minute !== "*" && hour !== "*") {
    segments.push(`At ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`);
  }

  if (dayOfMonth !== "*") {
    segments.push(`on day ${dayOfMonth}`);
  }

  if (month !== "*") {
    const monthNames = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const m = Number(month);
    segments.push(`in ${monthNames[m] || month}`);
  }

  if (dayOfWeek !== "*") {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    if (dayOfWeek.includes("-")) {
      const [start, end] = dayOfWeek.split("-").map(Number);
      segments.push(`${dayNames[start]}-${dayNames[end]}`);
    } else {
      const d = Number(dayOfWeek);
      segments.push(`on ${dayNames[d] || dayOfWeek}`);
    }
  }

  return segments.join(" ") || expression;
}

export function getNextRuns(expression: string, count: number = 5): Date[] {
  if (!isValidCron(expression)) return [];

  const dates: Date[] = [];
  const now = new Date();
  let current = new Date(now);
  current.setSeconds(0, 0);
  current.setMinutes(current.getMinutes() + 1);

  const parts = expression.trim().split(/\s+/);
  const maxIterations = 525600; // 1 year in minutes

  for (let i = 0; i < maxIterations && dates.length < count; i++) {
    if (matchesCron(current, parts)) {
      dates.push(new Date(current));
    }
    current.setMinutes(current.getMinutes() + 1);
  }

  return dates;
}

function matchesCron(date: Date, parts: string[]): boolean {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  return (
    matchesField(date.getMinutes(), minute) &&
    matchesField(date.getHours(), hour) &&
    matchesField(date.getDate(), dayOfMonth) &&
    matchesField(date.getMonth() + 1, month) &&
    matchesField(date.getDay(), dayOfWeek)
  );
}

function matchesField(value: number, field: string): boolean {
  if (field === "*") return true;

  if (field.includes("/")) {
    const [range, step] = field.split("/");
    const stepNum = Number(step);
    if (range === "*") return value % stepNum === 0;
    const [start] = range.split("-").map(Number);
    return value >= start && (value - start) % stepNum === 0;
  }

  if (field.includes(",")) {
    return field.split(",").some((f) => matchesField(value, f));
  }

  if (field.includes("-")) {
    const [start, end] = field.split("-").map(Number);
    return value >= start && value <= end;
  }

  return value === Number(field);
}
