import type { useFormatter } from "next-intl";
import { clubDayAnchor } from "@dragons/shared";

type Formatter = ReturnType<typeof useFormatter>;

const DATE_OPTS = { weekday: "short", day: "numeric", month: "short" } as const;

/**
 * Formats a referee-game kickoff for display.
 * @param format next-intl formatter from `useFormatter()`
 * @param date   kickoff date as "YYYY-MM-DD"
 * @param time   optional kickoff time as "HH:MM:SS" (seconds dropped); omit for date-only
 * @returns e.g. "Sat, Apr 25 · 18:30" (en) / "Sa., 25. Apr. · 18:30" (de), locale-aware
 */
export function formatKickoff(format: Formatter, date: string, time?: string | null): string {
  // Noon *Berlin* anchor avoids UTC-vs-local date rollover (matches the public
  // pages, and now the admin surface too — see @dragons/shared/kickoff).
  const datePart = format.dateTime(clubDayAnchor(date), DATE_OPTS);
  return time ? `${datePart} · ${time.slice(0, 5)}` : datePart;
}
