/**
 * The app's single source of kickoff date/time rendering.
 *
 * Before this module the same "weekday DD.MM. HH:MM" body was copy-pasted into
 * seven components, the `de-DE`/`en-US` resolver into five of them, and three
 * different "today" implementations disagreed about which day it was. All of
 * that now delegates to the timezone-explicit helpers in `@dragons/shared`
 * (which the web app shares), with the app's current i18n locale read *per
 * call* so a locale switch takes effect without remounting anything.
 */
import {
  daysUntilKickoff,
  formatKickoffCompact,
  formatKickoffLong,
  formatKickoffShortNumeric,
  resolveDateLocale,
  todayInClubZone,
} from "@dragons/shared";
import { i18n } from "@/lib/i18n";

function currentDateLocale(): string {
  return resolveDateLocale(i18n.locale);
}

/** `"Sat 25.04. 18:30"` — match/referee cards and detail headers. */
export function kickoffCompact(date: string, time?: string | null): string {
  return formatKickoffCompact(date, time, currentDateLocale());
}

/** `"Saturday, 25.04.2026"` — schedule and officiating section headers. */
export function kickoffLong(date: string): string {
  return formatKickoffLong(date, currentDateLocale());
}

/** `"25.04.26"` — head-to-head rows. */
export function kickoffShortNumeric(date: string): string {
  return formatKickoffShortNumeric(date);
}

/** Today's `YYYY-MM-DD` in the club's timezone — compare against `kickoffDate`. */
export function kickoffToday(now?: Date): string {
  return todayInClubZone(now);
}

/** Whole days from today (club timezone) until a kickoff date. */
export function kickoffCountdownDays(date: string, now?: Date): number {
  return daysUntilKickoff(date, now);
}
