/**
 * The one place the web app converts between Berlin calendar days / wall-clock
 * times and JS `Date` instants.
 *
 * Why this module exists: the API stores and returns Berlin-local
 * `YYYY-MM-DD` days and `HH:MM:SS` times, and `i18n/request.ts` pins every
 * `useFormatter()` output to `Europe/Berlin`. A `Date` built from those strings
 * without an explicit zone is interpreted in the *runtime's* zone — UTC in the
 * API/SSR container, whatever the admin's laptop says in the browser — so the
 * same value rendered twice disagrees by an hour, or by a whole day.
 *
 * Rules:
 *   - Never call `toISOString().slice(0, 10)` on a `Date` to get a day. Use
 *     `toBerlinDateString` (for an instant) or `calendarDayString` (for a day
 *     the user picked in a calendar widget).
 *   - Never build `new Date(day + "T00:00:00")` or `new Date("1970-01-01T" +
 *     time)`. Use `berlinDayAnchor` / `berlinTimeAnchor`.
 *
 * `berlinDayAnchor` keeps the **noon** anchor the public pages already use and
 * document in `lib/format-kickoff.ts`, but pins it to noon *Berlin* rather than
 * noon in whatever zone happens to be running, so the rendered day is right
 * even for a viewer 14 hours away.
 */

export const ADMIN_TZ = "Europe/Berlin";

const DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: ADMIN_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Reads back a full Berlin wall clock so we can solve for the instant that
 * produces a wanted wall clock. `hourCycle: "h23"` keeps midnight as "00", not
 * "24".
 */
const WALL_CLOCK_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: ADMIN_TZ,
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

const INVALID_DATE = () => new Date(NaN);

/** Milliseconds to add to `utcMs` to get the Berlin wall clock read as UTC. */
function berlinOffsetMs(utcMs: number): number {
  const parts = WALL_CLOCK_FMT.formatToParts(new Date(utcMs));
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

/** The instant at which Berlin's wall clock reads the given date and time. */
function berlinInstant(
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
  let ms = naive - berlinOffsetMs(naive);
  ms = naive - berlinOffsetMs(ms);
  return new Date(ms);
}

/** The Berlin calendar day (`YYYY-MM-DD`) containing `at`. Defaults to now. */
export function toBerlinDateString(at: Date = new Date()): string {
  return DAY_FMT.format(at);
}

export function todayInBerlin(): string {
  return toBerlinDateString();
}

export function plusDaysInBerlin(days: number): string {
  return toBerlinDateString(new Date(Date.now() + days * 86400_000));
}

/**
 * The calendar day a picker `Date` stands for, as `YYYY-MM-DD`.
 *
 * Calendar widgets hand back local midnight of the clicked day, so the day the
 * user meant lives in the *local* components — converting the instant to
 * another zone (or to UTC via `toISOString()`) shifts it by one.
 */
export function calendarDayString(picked: Date): string {
  if (Number.isNaN(picked.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${picked.getFullYear()}-${pad(picked.getMonth() + 1)}-${pad(picked.getDate())}`;
}

/**
 * Anchor a Berlin calendar day (`YYYY-MM-DD`) for display.
 *
 * Returns noon Berlin on that day, so `format.dateTime(...)` renders the day
 * you asked for no matter which zone the code is running in.
 */
export function berlinDayAnchor(day: string): Date {
  const m = DAY_RE.exec(day);
  if (!m) return INVALID_DATE();
  return berlinInstant(Number(m[1]), Number(m[2]), Number(m[3]), 12, 0, 0);
}

/**
 * Anchor a Berlin wall-clock time (`HH:MM` or `HH:MM:SS`) for display.
 *
 * Returns the instant whose Berlin wall clock reads that time, so
 * `format.dateTime(..., "matchTime")` renders it unchanged on a UTC server and
 * on a client anywhere. Pass `onDay` when the calendar day is known — only the
 * time-of-day is used for display, but a real day keeps the instant meaningful.
 */
export function berlinTimeAnchor(time: string, onDay = TIME_ANCHOR_DAY): Date {
  const t = TIME_RE.exec(time);
  const d = DAY_RE.exec(onDay) ?? DAY_RE.exec(TIME_ANCHOR_DAY)!;
  if (!t) return INVALID_DATE();
  return berlinInstant(
    Number(d[1]),
    Number(d[2]),
    Number(d[3]),
    Number(t[1]),
    Number(t[2]),
    Number(t[3] ?? 0),
  );
}
