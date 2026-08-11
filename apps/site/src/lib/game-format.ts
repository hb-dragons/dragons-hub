import { CLUB_TIME_ZONE, clubDayAnchor } from "@dragons/shared";

/**
 * Ports of dragons-app `app/utils/format.ts` — the labels on the game cards
 * and date headings. The legacy helpers formatted in the server's local zone
 * (Berlin in prod); these pin Europe/Berlin explicitly via the shared kickoff
 * helpers so every runtime renders the same day.
 */

const GAME_DATE_FMT = new Intl.DateTimeFormat("de-DE", {
  timeZone: CLUB_TIME_ZONE,
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

/** `2026-04-25` → `Samstag, 25.04.26` (legacy `formatDate`). */
export function formatGameDate(date: string): string {
  const anchor = clubDayAnchor(date);
  if (Number.isNaN(anchor.getTime())) return date;
  return GAME_DATE_FMT.format(anchor);
}

/** `15:00:00` → `15:00` (legacy `formatTime`). */
export function formatGameTime(time: string): string {
  return time.split(":").slice(0, 2).join(":");
}
