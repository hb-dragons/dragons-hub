import type { Locale, PushTemplateOutput } from "./types";
import { BODY_MAX, TITLE_MAX } from "./types";

export interface RefereeSlotsPushPayload {
  matchId: number;
  homeTeam: string;
  guestTeam: string;
  kickoffDate: string;
  kickoffTime: string;
  sr1Open: boolean;
  sr2Open: boolean;
  sr1Assigned: string | null;
  sr2Assigned: string | null;
  reminderLevel?: number;
  eventId: string;
}

export function renderRefereeSlotsPush(
  p: RefereeSlotsPushPayload,
  locale: Locale,
  variant: "needed" | "reminder",
): PushTemplateOutput {
  return {
    title: truncate(titleFor(locale, variant), TITLE_MAX),
    body: truncate(bodyFor(p, locale, variant), BODY_MAX),
    data: {
      deepLink: "/(tabs)/referee",
      eventType: variant === "needed" ? "referee.slots.needed" : "referee.slots.reminder",
      eventId: p.eventId,
      matchId: p.matchId,
    },
  };
}

function titleFor(locale: Locale, variant: "needed" | "reminder"): string {
  if (variant === "needed") {
    return locale === "de" ? "🏀 Schiedsrichter gesucht" : "🏀 Referees needed";
  }
  return locale === "de" ? "⚠️ Schiedsrichter benötigt" : "⚠️ Referees still needed";
}

function bodyFor(
  p: RefereeSlotsPushPayload,
  locale: Locale,
  variant: "needed" | "reminder",
): string {
  const openSlots: string[] = [];
  if (p.sr1Open) openSlots.push("SR1");
  if (p.sr2Open) openSlots.push("SR2");
  const slotText = openSlots.join(" + ");
  const matchup = `${p.homeTeam} vs. ${p.guestTeam}`;
  const when = `${formatDate(p.kickoffDate, locale)} ${p.kickoffTime}`;

  if (variant === "needed") {
    return locale === "de"
      ? `${slotText} offen für ${matchup} am ${when}`
      : `${slotText} open for ${matchup} on ${when}`;
  }
  const days = p.reminderLevel ?? 0;
  return locale === "de"
    ? `In ${days} Tagen: ${slotText} noch offen — ${matchup}`
    : `In ${days} days: ${slotText} still open — ${matchup}`;
}

function formatDate(iso: string, locale: Locale): string {
  const [y, m, d] = iso.split("-");
  return locale === "de" ? `${d}.${m}.${y}` : `${y}-${m}-${d}`;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}
