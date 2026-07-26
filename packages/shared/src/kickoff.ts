/**
 * The one place the whole monorepo converts between club-local calendar days /
 * wall-clock times and JS `Date` instants.
 *
 * The federation expresses kickoffs — and the API stores and returns bookings,
 * task due dates and match dates — as a `YYYY-MM-DD` calendar day plus an
 * `HH:MM[:SS]` wall-clock time, both in {@link CLUB_TIME_ZONE} and neither
 * carrying an offset. Anything that hands those strings straight to
 * `new Date(...)` inherits whatever zone the runtime happens to be in: UTC in
 * the API/SSR container, whatever the admin's laptop or the fan's phone says in
 * the client. The same value then renders differently in two places, off by an
 * hour or by a whole day:
 *
 * - `new Date("2026-04-25")` parses as **UTC** midnight, so it renders as
 *   24 Apr anywhere west of Greenwich.
 * - `new Date().toISOString().slice(0, 10)` is the **UTC** calendar day, so
 *   between 00:00 and 02:00 CEST it is still "yesterday" in Berlin — a
 *   "from today" query then includes games that already tipped off and drops
 *   the current day's results.
 * - `new Date("2026-07-15T12:00:00")` is noon in the *runtime's* zone, which is
 *   already the 16th in Berlin for a viewer in Honolulu.
 *
 * Rules:
 *   - Never call `toISOString().slice(0, 10)` on a `Date` to get a day. Use
 *     {@link toClubDateString} (for an instant) or {@link calendarDayString}
 *     (for a day the user picked in a calendar widget).
 *   - Never build `new Date(day + "T00:00:00")` or `new Date("1970-01-01T" +
 *     time)`. Use {@link clubDayAnchor} / {@link clubTimeAnchor}.
 *
 * {@link clubDayAnchor} keeps the **noon** anchor the public pages already use,
 * but pins it to noon *in the club zone* rather than noon in whatever zone
 * happens to be running. Noon rather than midnight because midnight is not a
 * valid wall-clock time in every zone on every day (America/Santiago deletes it
 * each September), and noon leaves ~12h of slack either side of any DST shift.
 * The instants it returns are therefore safe to hand to a club-pinned formatter
 * (`next-intl`'s `useFormatter()`, which `i18n/request.ts` pins to Berlin) *and*
 * to the locale formatters below, which read them back club-pinned too.
 */

/**
 * Timezone that federation kickoff dates and times — and every other bare
 * `YYYY-MM-DD` / `HH:MM:SS` the API returns — are expressed in.
 */
export const CLUB_TIME_ZONE = "Europe/Berlin";

/**
 * Built once with an explicit `timeZone`, which is exactly what makes it immune
 * to the device timezone (and to a test changing `process.env.TZ` after this
 * module has been imported). `en-CA` renders ISO-order `YYYY-MM-DD` directly.
 */
const CLUB_DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: CLUB_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Reads back a full club wall clock so we can solve for the instant that
 * produces a wanted wall clock. `hourCycle: "h23"` keeps midnight as "00", not
 * "24".
 */
const CLUB_WALL_CLOCK_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: CLUB_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** Default day for time-only anchors; any DST-stable day would do. */
const TIME_ANCHOR_DAY = "1970-01-01";

const DAY_MS = 86_400_000;

const INVALID_DATE = () => new Date(NaN);

function isValid(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

/** Milliseconds to add to `utcMs` to get the club wall clock read as UTC. */
function clubOffsetMs(utcMs: number): number {
  const parts = CLUB_WALL_CLOCK_FMT.formatToParts(new Date(utcMs));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  const asIfUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
  return asIfUtc - utcMs;
}

/** The instant at which the club's wall clock reads the given date and time. */
function clubInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  // First pass guesses the offset from the naive instant; the second re-reads
  // it at the corrected instant, which matters within a few hours of a DST
  // switch where the two offsets differ.
  let ms = naive - clubOffsetMs(naive);
  ms = naive - clubOffsetMs(ms);
  return new Date(ms);
}

/**
 * The club calendar day (`YYYY-MM-DD`) containing `at` — directly comparable to
 * a match's `kickoffDate`. Defaults to now.
 */
export function toClubDateString(at: Date = new Date()): string {
  if (!isValid(at)) return "";
  return CLUB_DAY_FMT.format(at);
}

/**
 * The current calendar day in the club's timezone, as `YYYY-MM-DD`.
 *
 * @param now instant to resolve; defaults to the real clock. Pass one in tests.
 */
export function todayInClubZone(now: Date = new Date()): string {
  return toClubDateString(now);
}

/**
 * The club calendar day `days` from now (negative goes backwards). Backs the
 * "next 14 / 30 days" filter presets.
 */
export function plusDaysInClubZone(days: number, from: Date = new Date()): string {
  return toClubDateString(new Date(from.getTime() + days * DAY_MS));
}

/**
 * The calendar day a picker `Date` stands for, as `YYYY-MM-DD`.
 *
 * **Deliberately not a timezone conversion.** Calendar widgets (react-day-picker)
 * hand back local midnight of the clicked day, so the day the user meant lives
 * in the *local* components. Converting the instant to the club zone — or to UTC
 * via `toISOString()` — shifts it by one and reintroduces an off-by-one in the
 * date-range filters. Everything else in this module is club-pinned; this one is
 * not, on purpose.
 */
export function calendarDayString(picked: Date): string {
  if (!isValid(picked)) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${picked.getFullYear()}-${pad(picked.getMonth() + 1)}-${pad(picked.getDate())}`;
}

/**
 * Anchor a club calendar day (`YYYY-MM-DD`) as an instant, for display or for
 * day arithmetic.
 *
 * Returns noon in the club zone on that day, so a club-pinned formatter renders
 * the day you asked for no matter which zone the code is running in — and so
 * does {@link toClubDateString}, which it round-trips through.
 *
 * Returns an Invalid Date (never throws) for input that is not a real calendar
 * day, including out-of-range components like `2026-02-30` that `Date` would
 * otherwise silently roll over.
 */
export function clubDayAnchor(day: string): Date {
  const m = DAY_RE.exec(day);
  if (!m) return INVALID_DATE();
  const at = clubInstant(Number(m[1]), Number(m[2]), Number(m[3]), 12, 0, 0);
  // Rejects rollovers (2026-02-30 -> 2026-03-02) rather than shipping a day the
  // caller never asked for.
  return toClubDateString(at) === day ? at : INVALID_DATE();
}

/**
 * Anchor a club wall-clock time (`HH:MM` or `HH:MM:SS`) as an instant.
 *
 * Returns the instant whose club wall clock reads that time, so a club-pinned
 * formatter renders it unchanged on a UTC server and on a client anywhere. Pass
 * `onDay` when the calendar day is known — only the time-of-day is used for
 * display, but a real day picks the right side of a DST boundary.
 */
export function clubTimeAnchor(time: string, onDay = TIME_ANCHOR_DAY): Date {
  const t = TIME_RE.exec(time);
  const d = DAY_RE.exec(onDay) ?? DAY_RE.exec(TIME_ANCHOR_DAY)!;
  if (!t) return INVALID_DATE();
  return clubInstant(
    Number(d[1]),
    Number(d[2]),
    Number(d[3]),
    Number(t[1]),
    Number(t[2]),
    Number(t[3] ?? 0),
  );
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
 * The weekday name of an instant, read in the club zone. Built per call because
 * the locale varies; the explicit `timeZone` is what keeps it device-independent.
 */
function clubWeekday(at: Date, locale: string, width: "short" | "long"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: CLUB_TIME_ZONE,
    weekday: width,
  }).format(at);
}

/** `HH:MM:SS` -> `HH:MM`. Returns null for null/empty input. */
function shortTime(time: string | null | undefined): string | null {
  if (!time) return null;
  return time.slice(0, 5);
}

/**
 * The club-zone year/month/day a `YYYY-MM-DD` string names, plus its noon
 * anchor — or null if it is not a real calendar day.
 */
function clubDayFields(
  date: string,
): { at: Date; year: string; month: string; day: string } | null {
  const at = clubDayAnchor(date);
  if (!isValid(at)) return null;
  const m = DAY_RE.exec(date)!;
  return { at, year: m[1]!, month: m[2]!, day: m[3]! };
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
  const f = clubDayFields(date);
  if (!f) return date;
  const head = `${clubWeekday(f.at, locale, "short")} ${f.day}.${f.month}.`;
  const t = shortTime(time);
  return t ? `${head} ${t}` : head;
}

/**
 * Section-header kickoff label: `"Saturday, 25.04.2026"` (en) /
 * `"Samstag, 25.04.2026"` (de). Used by the schedule and officiating lists.
 */
export function formatKickoffLong(date: string, locale: string): string {
  const f = clubDayFields(date);
  if (!f) return date;
  return `${clubWeekday(f.at, locale, "long")}, ${f.day}.${f.month}.${f.year}`;
}

/** Dense numeric kickoff label: `"25.04.26"`. Used in head-to-head rows. */
export function formatKickoffShortNumeric(date: string): string {
  const f = clubDayFields(date);
  if (!f) return date;
  return `${f.day}.${f.month}.${f.year.slice(2)}`;
}

/**
 * Whole days from today (club timezone) to a kickoff date. Negative for past
 * dates. Used for the "today / tomorrow / in N days" countdown.
 *
 * Both ends are noon-in-club-zone anchors, so the difference is a whole number
 * of days give or take one DST hour — which `Math.round` absorbs.
 */
export function daysUntilKickoff(date: string, now: Date = new Date()): number {
  const from = clubDayAnchor(todayInClubZone(now));
  const to = clubDayAnchor(date);
  if (!isValid(to) || !isValid(from)) return Number.NaN;
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}
