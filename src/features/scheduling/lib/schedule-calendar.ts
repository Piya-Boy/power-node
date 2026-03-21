/**
 * Phase 29 — Advanced UX: Scheduling Calendar utilities
 * Compute upcoming workflow run times for calendar display.
 */

export interface ScheduledWorkflow {
  workflowId: string;
  workflowName: string;
  cronExpression: string;
  isActive: boolean;
  timezone?: string;
}

export interface ScheduledRun {
  workflowId: string;
  workflowName: string;
  scheduledAt: Date;
  cronExpression: string;
}

export interface CalendarDay {
  date: Date;
  runs: ScheduledRun[];
}

export interface CalendarWeek {
  weekStart: Date;
  days: CalendarDay[];
}

/**
 * Parse a cron field into a sorted list of matching values.
 * Supports: star, star/step, a-b, a,b,c, and combinations.
 * Returns sorted unique values within [min, max].
 */
export function parseCronField(field: string, min: number, max: number): number[] {
  const values = new Set<number>();

  for (const part of field.split(",")) {
    if (part === "*") {
      for (let i = min; i <= max; i++) values.add(i);
    } else if (part.includes("/")) {
      const [range, stepStr] = part.split("/");
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step < 1) continue;
      const start = range === "*" ? min : parseInt(range, 10);
      for (let i = start; i <= max; i += step) values.add(i);
    } else if (part.includes("-")) {
      const [fromStr, toStr] = part.split("-");
      const from = parseInt(fromStr, 10);
      const to = parseInt(toStr, 10);
      for (let i = from; i <= to; i++) values.add(i);
    } else {
      const val = parseInt(part, 10);
      if (!isNaN(val) && val >= min && val <= max) values.add(val);
    }
  }

  return [...values].sort((a, b) => a - b);
}

/**
 * Get the next N run times for a cron expression after a given timestamp.
 * Supports 5-field cron: minute hour dom month dow
 */
export function getNextRunTimes(
  cronExpression: string,
  after: Date,
  count: number,
  maxIterations = 50000
): Date[] {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) return [];

  const [minField, hourField, domField, monthField, dowField] = parts;

  const minutes = parseCronField(minField, 0, 59);
  const hours = parseCronField(hourField, 0, 23);
  const doms = parseCronField(domField, 1, 31);
  const months = parseCronField(monthField, 1, 12);
  const dows = parseCronField(dowField, 0, 6);

  const results: Date[] = [];
  // Start from next minute after `after`
  let current = new Date(after);
  current.setSeconds(0, 0);
  current.setMinutes(current.getMinutes() + 1);

  let iterations = 0;
  while (results.length < count && iterations < maxIterations) {
    iterations++;

    const month = current.getMonth() + 1; // 1-12
    if (!months.includes(month)) {
      // Advance to next month
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1, 0, 0, 0);
      continue;
    }

    const dom = current.getDate(); // 1-31
    const dow = current.getDay(); // 0-6
    if (!doms.includes(dom) || !dows.includes(dow)) {
      current = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1, 0, 0, 0);
      continue;
    }

    const hour = current.getHours();
    if (!hours.includes(hour)) {
      current = new Date(current.getFullYear(), current.getMonth(), current.getDate(), current.getHours() + 1, 0, 0);
      continue;
    }

    const minute = current.getMinutes();
    if (!minutes.includes(minute)) {
      current = new Date(current.getFullYear(), current.getMonth(), current.getDate(), current.getHours(), current.getMinutes() + 1, 0);
      continue;
    }

    results.push(new Date(current));
    current = new Date(current.getFullYear(), current.getMonth(), current.getDate(), current.getHours(), current.getMinutes() + 1, 0);
  }

  return results;
}

/**
 * Build a calendar view for N days showing all scheduled runs.
 */
export function buildCalendarView(
  workflows: ScheduledWorkflow[],
  startDate: Date,
  days: number
): CalendarDay[] {
  const calendar: CalendarDay[] = [];
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + days);

  // Generate calendar days
  for (let d = 0; d < days; d++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + d);
    date.setHours(0, 0, 0, 0);
    calendar.push({ date, runs: [] });
  }

  // Compute runs for each active workflow
  for (const wf of workflows) {
    if (!wf.isActive) continue;

    const yesterday = new Date(startDate);
    yesterday.setDate(yesterday.getDate() - 1);

    const runs = getNextRunTimes(wf.cronExpression, yesterday, 500);

    for (const run of runs) {
      if (run >= endDate) break;

      const dayIndex = Math.floor(
        (run.getTime() - new Date(startDate).setHours(0, 0, 0, 0)) / (24 * 60 * 60 * 1000)
      );
      if (dayIndex >= 0 && dayIndex < days) {
        calendar[dayIndex].runs.push({
          workflowId: wf.workflowId,
          workflowName: wf.workflowName,
          scheduledAt: run,
          cronExpression: wf.cronExpression,
        });
      }
    }
  }

  // Sort runs within each day
  for (const day of calendar) {
    day.runs.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  }

  return calendar;
}

/**
 * Group calendar days into weeks.
 */
export function groupIntoWeeks(days: CalendarDay[]): CalendarWeek[] {
  const weeks: CalendarWeek[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const chunk = days.slice(i, i + 7);
    weeks.push({ weekStart: chunk[0].date, days: chunk });
  }
  return weeks;
}

/**
 * Get the busiest day in the calendar (most scheduled runs).
 */
export function getBusiestDay(calendar: CalendarDay[]): CalendarDay | null {
  if (calendar.length === 0) return null;
  return calendar.reduce((max, day) => (day.runs.length > max.runs.length ? day : max));
}

/**
 * Count total runs in a calendar view.
 */
export function countTotalRuns(calendar: CalendarDay[]): number {
  return calendar.reduce((sum, day) => sum + day.runs.length, 0);
}
