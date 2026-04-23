import type { Locale, PushTemplateOutput } from "./types";
import { BODY_MAX, TITLE_MAX } from "./types";

export interface RefereeAssignedPayload {
  matchId: number;
  matchNo: string;
  homeTeam: string;
  guestTeam: string;
  slot: "SR1" | "SR2";
  kickoffDate: string;
  kickoffTime: string;
  eventId: string;
}

const TITLE = {
  de: "🏀 Schiedsrichter zugewiesen",
  en: "🏀 Referee assigned",
};

const BODY = {
  de: (p: RefereeAssignedPayload) =>
    `Du wurdest als ${p.slot} für ${p.homeTeam} vs. ${p.guestTeam} am ${formatDe(p.kickoffDate)} um ${p.kickoffTime} eingesetzt.`,
  en: (p: RefereeAssignedPayload) =>
    `You've been assigned as ${p.slot} for ${p.homeTeam} vs. ${p.guestTeam} on ${formatEn(p.kickoffDate)} at ${p.kickoffTime}.`,
};

export function renderRefereeAssignedPush(
  payload: RefereeAssignedPayload,
  locale: Locale,
): PushTemplateOutput {
  return {
    title: truncate(TITLE[locale], TITLE_MAX),
    body: truncate(BODY[locale](payload), BODY_MAX),
    data: {
      deepLink: `/referee-game/${payload.matchId}`,
      eventType: "referee.assigned",
      eventId: payload.eventId,
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

function formatEn(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${y}-${m}-${d}`;
}
