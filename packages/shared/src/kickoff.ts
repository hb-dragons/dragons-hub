/**
 * Kickoff date/time helpers shared by every client surface.
 *
 * The federation expresses kickoffs as a `YYYY-MM-DD` calendar date plus an
 * `HH:MM[:SS]` wall-clock time, both in the club's timezone. Neither carries an
 * offset, so any client that hands those strings straight to `new Date(...)`
 * inherits whatever timezone the device happens to be in:
 *
 * - `new Date("2026-04-25")` is parsed as **UTC** midnight, so it renders as
 *   24 Apr anywhere west of Greenwich.
 * - `new Date().toISOString().slice(0, 10)` is the **UTC** calendar day, so
 *   between 00:00 and 02:00 CEST it is still "yesterday" in Berlin — a
 *   "from today" query then includes games that already tipped off and drops
 *   the current day's results.
 *
 * Everything here is timezone-explicit instead: "today" is resolved in
 * {@link CLUB_TIME_ZONE}, and kickoff dates are anchored at local noon so the
 * calendar day survives both UTC rollover and DST transitions that delete
 * local midnight (e.g. America/Santiago in September).
 */

/** Timezone that federation kickoff dates and times are expressed in. */
export const CLUB_TIME_ZONE = "Europe/Berlin";

/**
 * Built once with an explicit `timeZone`, which is exactly what makes it
 * immune to the device timezone (and to a test changing `process.env.TZ`
 * after this module has been imported).
 */
const CLUB_DAY_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: CLUB_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * The current calendar day in the club's timezone, as `YYYY-MM-DD` — directly
 * comparable to a match's `kickoffDate`.
 *
 * @param now instant to resolve; defaults to the real clock. Pass one in tests.
 */
export function todayInClubZone(now: Date = new Date()): string {
  let year = "";
  let month = "";
  let day = "";
  for (const part of CLUB_DAY_PARTS.formatToParts(now)) {
    if (part.type === "year") year = part.value;
    else if (part.type === "month") month = part.value;
    else if (part.type === "day") day = part.value;
  }
  return `${year}-${month}-${day}`;
}

/**
 * Maps the app's UI locale (`"de"`, `"en"`, `"de-AT"`, …) onto the BCP-47 tag
 * the date formatters should use. Previously inlined five times in the native
 * app as `i18n.locale === "de" ? "de-DE" : "en-US"`.
 */
export function resolveDateLocale(appLocale: string | null | undefined): string {
  return appLocale?.toLowerCase().startsWith("de") ? "de-DE" : "en-US";
}

/**
 * Parses a `YYYY-MM-DD` kickoff date into a `Date` that lands on that calendar
 * day in the *device's* timezone, so `getDate()` / `toLocaleDateString()` agree
 * with the federation's date.
 *
 * Anchored at 12:00 rather than 00:00: midnight is a valid wall-clock time in
 * most zones but not all, and noon leaves ~12h of slack on either side of any
 * DST shift.
 *
 * Returns an Invalid Date (never throws) for input that isn't a date.
 */
export function parseKickoffDate(date: string): Date {
  return new Date(`${date}T12:00:00`);
}

function isValid(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

function dd(n: number): string {
  return n.toString().padStart(2, "0");
}

/** `HH:MM:SS` -> `HH:MM`. Returns null for null/empty input. */
function shortTime(time: string | null | undefined): string | null {
  if (!time) return null;
  return time.slice(0, 5);
}

/**
 * Compact kickoff label: `"Sat 25.04. 18:30"` (en) / `"Sa 25.04. 18:30"` (de).
 * Used on match and referee-game cards and detail headers.
 *
 * @param locale a BCP-47 tag; use `resolveDateLocale()` on the client to map
 *               the app's `de`/`en` locale onto one.
 */
export function formatKickoffCompact(
  date: string,
  time: string | null | undefined,
  locale: string,
): string {
  const d = parseKickoffDate(date);
  if (!isValid(d)) return date;
  const weekday = d.toLocaleDateString(locale, { weekday: "short" });
  const head = `${weekday} ${dd(d.getDate())}.${dd(d.getMonth() + 1)}.`;
  const t = shortTime(time);
  return t ? `${head} ${t}` : head;
}

/**
 * Section-header kickoff label: `"Saturday, 25.04.2026"` (en) /
 * `"Samstag, 25.04.2026"` (de). Used by the schedule and officiating lists.
 */
export function formatKickoffLong(date: string, locale: string): string {
  const d = parseKickoffDate(date);
  if (!isValid(d)) return date;
  const weekday = d.toLocaleDateString(locale, { weekday: "long" });
  return `${weekday}, ${dd(d.getDate())}.${dd(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** Dense numeric kickoff label: `"25.04.26"`. Used in head-to-head rows. */
export function formatKickoffShortNumeric(date: string): string {
  const d = parseKickoffDate(date);
  if (!isValid(d)) return date;
  return `${dd(d.getDate())}.${dd(d.getMonth() + 1)}.${d.getFullYear().toString().slice(2)}`;
}

/**
 * Whole days from today (club timezone) to a kickoff date. Negative for past
 * dates. Used for the "today / tomorrow / in N days" countdown.
 */
export function daysUntilKickoff(date: string, now: Date = new Date()): number {
  const from = parseKickoffDate(todayInClubZone(now));
  const to = parseKickoffDate(date);
  if (!isValid(to)) return Number.NaN;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}
