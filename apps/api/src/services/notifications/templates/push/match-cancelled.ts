import type { Locale, PushTemplateOutput } from "./types";
import { BODY_MAX, TITLE_MAX } from "./types";
import { formatDe, truncate } from "./_utils";

export interface MatchCancelledPayload {
  matchId: number;
  homeTeam: string;
  guestTeam: string;
  kickoffDate: string;
  kickoffTime: string;
  eventId: string;
}

const TITLE = {
  de: "❌ Spiel abgesagt",
  en: "❌ Match cancelled",
};

export function renderMatchCancelledPush(
  p: MatchCancelledPayload,
  locale: Locale,
): PushTemplateOutput {
  const body =
    locale === "de"
      ? `${p.homeTeam} vs. ${p.guestTeam} (${formatDe(p.kickoffDate)}) wurde abgesagt.`
      : `${p.homeTeam} vs. ${p.guestTeam} (${p.kickoffDate}) has been cancelled.`;
  return {
    title: truncate(TITLE[locale], TITLE_MAX),
    body: truncate(body, BODY_MAX),
    data: {
      deepLink: `/game/${p.matchId}`,
      eventType: "match.cancelled",
      eventId: p.eventId,
    },
  };
}

