/**
 * `YYYY-MM-DD` <-> `Date`, both anchored to the device's local day.
 *
 * The board's due dates are calendar days, not instants: the server column is
 * a `date`. Going through UTC in either direction moves the day for most of
 * the world, which is why neither `new Date(iso)` nor
 * `toISOString().slice(0, 10)` is used here.
 */

/** Parse `"YYYY-MM-DD"` (with or without a time part) as local midnight. */
export function parseLocalDate(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return new Date(iso);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Format a `Date` as the local `YYYY-MM-DD` the API expects. */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
