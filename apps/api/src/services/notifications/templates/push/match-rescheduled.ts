import type { Locale, PushTemplateOutput } from "./types";
import { BODY_MAX, TITLE_MAX } from "./types";

export interface MatchRescheduledPayload {
  matchId: number;
  homeTeam: string;
  guestTeam: string;
  kickoffDate: string;
  kickoffTime: string;
  oldKickoffDate: string;
  oldKickoffTime: string;
  eventId: string;
}

const TITLE = {
  de: "📅 Spiel verschoben",
  en: "📅 Match rescheduled",
};

export function renderMatchRescheduledPush(
  p: MatchRescheduledPayload,
  locale: Locale,
): PushTemplateOutput {
  const dateNew = formatDate(p.kickoffDate, locale);
  const dateOld = formatDate(p.oldKickoffDate, locale);
  const body =
    locale === "de"
      ? `${p.homeTeam} vs. ${p.guestTeam}: neuer Termin ${dateNew} ${p.kickoffTime} (vorher ${dateOld} ${p.oldKickoffTime}).`
      : `${p.homeTeam} vs. ${p.guestTeam}: new kickoff ${dateNew} ${p.kickoffTime} (was ${dateOld} ${p.oldKickoffTime}).`;
  return {
    title: truncate(TITLE[locale], TITLE_MAX),
    body: truncate(body, BODY_MAX),
    data: {
      deepLink: `/game/${p.matchId}`,
      eventType: "match.rescheduled",
      eventId: p.eventId,
    },
  };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

function formatDate(iso: string, locale: Locale): string {
  const [y, m, d] = iso.split("-");
  return locale === "de" ? `${d}.${m}.${y}` : `${y}-${m}-${d}`;
}
