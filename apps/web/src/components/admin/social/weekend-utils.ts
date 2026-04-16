import {
  getSaturday,
  getSunday,
  previousSaturday,
  nextSaturday,
} from "@/lib/weekend-utils";

/**
 * Get the Saturday of the most recent fully-past weekend.
 * If today is Saturday or Sunday, the current weekend is still
 * in progress — return the previous week's Saturday.
 *
 * NOTE: getSaturday() returns the Saturday of the same Mon-Sun week,
 * which is the *upcoming* Saturday for Mon-Fri dates.
 */
export function getLastWeekendSaturday(today: Date = new Date()): Date {
  const day = today.getDay(); // 0=Sun, 6=Sat
  if (day === 0 || day === 6) {
    // Weekend in progress — go back to last week's Saturday
    const thisSat = getSaturday(today);
    return previousSaturday(thisSat);
  }
  // Weekday — getSaturday returns THIS week's upcoming Saturday,
  // so go back one week to get last weekend's Saturday
  return previousSaturday(getSaturday(today));
}

/**
 * Get the Saturday of the next weekend that hasn't started yet.
 * If today is Saturday or Sunday, "next" is next week's Saturday.
 */
export function getNextWeekendSaturday(today: Date = new Date()): Date {
  const day = today.getDay();
  if (day === 0 || day === 6) {
    // Weekend in progress — next weekend is +1 week from this Saturday
    const thisSat = getSaturday(today);
    return nextSaturday(thisSat);
  }
  // Weekday — getSaturday returns THIS week's upcoming Saturday,
  // which is exactly what we want for "next weekend"
  return getSaturday(today);
}

/** Returns ISO 8601 week number and year for a given date. */
export function getISOWeekAndYear(date: Date): { week: number; year: number } {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return { week, year: d.getUTCFullYear() };
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];

/** Format a weekend date range for display: "Sa 7. – So 8. Mär" */
export function formatWeekendLabel(saturday: Date): string {
  const sunday = getSunday(saturday);
  const satDay = saturday.getDate();
  const sunDay = sunday.getDate();
  const satMonth = MONTH_NAMES[saturday.getMonth()]!;
  const sunMonth = MONTH_NAMES[sunday.getMonth()]!;

  if (satMonth === sunMonth) {
    return `Sa ${satDay}. – So ${sunDay}. ${satMonth}`;
  }
  return `Sa ${satDay}. ${satMonth} – So ${sunDay}. ${sunMonth}`;
}

/** Format a date range from YYYY-MM-DD strings: "Sa 7. – So 8. Mär" */
export function formatDateRange(dateFrom: string, dateTo: string): string {
  const sat = new Date(dateFrom + "T12:00:00");
  const sun = new Date(dateTo + "T12:00:00");
  const satMonth = MONTH_NAMES[sat.getMonth()]!;
  const sunMonth = MONTH_NAMES[sun.getMonth()]!;
  if (satMonth === sunMonth) {
    return `Sa ${sat.getDate()}. – So ${sun.getDate()}. ${satMonth}`;
  }
  return `Sa ${sat.getDate()}. ${satMonth} – So ${sun.getDate()}. ${sunMonth}`;
}

export { toDateString, previousSaturday, nextSaturday } from "@/lib/weekend-utils";
