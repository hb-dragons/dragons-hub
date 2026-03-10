/**
 * Get the Saturday of the week containing the given date.
 * Weeks run Mon-Sun, so Saturday is day index 6.
 */
export function getSaturday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -1 : 6 - day; // Sunday → previous Saturday
  d.setDate(d.getDate() + diff);
  d.setHours(12, 0, 0, 0);
  return d;
}

/** Get the Sunday after a given Saturday */
export function getSunday(saturday: Date): Date {
  const d = new Date(saturday);
  d.setDate(d.getDate() + 1);
  return d;
}

/** Format a date as YYYY-MM-DD for API queries */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Navigate to the previous Saturday */
export function previousSaturday(saturday: Date): Date {
  const d = new Date(saturday);
  d.setDate(d.getDate() - 7);
  return d;
}

/** Navigate to the next Saturday */
export function nextSaturday(saturday: Date): Date {
  const d = new Date(saturday);
  d.setDate(d.getDate() + 7);
  return d;
}

/** Get the first day of the month containing the given date */
export function getMonthStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(12, 0, 0, 0);
  return d;
}

/** Get the last day of the month containing the given date */
export function getMonthEnd(date: Date): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1, 0); // Day 0 of next month = last day of current month
  d.setHours(12, 0, 0, 0);
  return d;
}
