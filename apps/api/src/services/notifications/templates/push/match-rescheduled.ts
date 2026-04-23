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
  const body =
    locale === "de"
      ? `${p.homeTeam} vs. ${p.guestTeam}: neuer Termin ${formatDe(p.kickoffDate)} ${p.kickoffTime} (vorher ${formatDe(p.oldKickoffDate)} ${p.oldKickoffTime}).`
      : `${p.homeTeam} vs. ${p.guestTeam}: new kickoff ${p.kickoffDate} ${p.kickoffTime} (was ${p.oldKickoffDate} ${p.oldKickoffTime}).`;
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

function formatDe(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
