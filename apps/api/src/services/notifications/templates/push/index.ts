import type { Locale, PushTemplateOutput } from "./types";
import {
  renderRefereeAssignedPush,
  type RefereeAssignedPayload,
} from "./referee-assigned";
import { renderRefereeUnassignedPush } from "./referee-unassigned";
import {
  renderRefereeReassignedPush,
  type RefereeReassignedPushPayload,
} from "./referee-reassigned";
import {
  renderRefereeSlotsPush,
  type RefereeSlotsPushPayload,
} from "./referee-slots";
import {
  renderMatchCancelledPush,
  type MatchCancelledPayload,
} from "./match-cancelled";
import {
  renderMatchRescheduledPush,
  type MatchRescheduledPayload,
} from "./match-rescheduled";

export interface RenderArgs {
  eventType: string;
  payload: Record<string, unknown>;
  locale: Locale;
  /** Domain event id, known at dispatch time (not part of the payload). */
  eventId?: string;
}

/**
 * Returns null when the event type has no push template.
 *
 * `eventId` is injected into the rendered `data` centrally so individual
 * templates don't have to know about it (and can't forget it). It is the
 * domain event row id, which lives on the dispatch envelope, not the payload.
 */
export function renderPushTemplate(args: RenderArgs): PushTemplateOutput | null {
  const { eventType, payload, locale, eventId } = args;
  const out = renderForType(eventType, payload, locale);
  if (out && eventId != null) {
    out.data = { ...out.data, eventId };
  }
  return out;
}

function renderForType(
  eventType: string,
  payload: Record<string, unknown>,
  locale: Locale,
): PushTemplateOutput | null {
  switch (eventType) {
    case "referee.assigned":
      return renderRefereeAssignedPush(payload as unknown as RefereeAssignedPayload, locale);
    case "referee.unassigned":
      return renderRefereeUnassignedPush(payload as unknown as RefereeAssignedPayload, locale);
    case "referee.reassigned":
      return renderRefereeReassignedPush(payload as unknown as RefereeReassignedPushPayload, locale);
    case "referee.slots.needed":
      return renderRefereeSlotsPush(payload as unknown as RefereeSlotsPushPayload, locale, "needed");
    case "referee.slots.reminder":
      return renderRefereeSlotsPush(payload as unknown as RefereeSlotsPushPayload, locale, "reminder");
    case "match.cancelled":
      return renderMatchCancelledPush(payload as unknown as MatchCancelledPayload, locale);
    case "match.rescheduled":
      return renderMatchRescheduledPush(payload as unknown as MatchRescheduledPayload, locale);
    default:
      return null;
  }
}

export type { PushTemplateOutput, Locale } from "./types";
export type { RefereeAssignedPayload } from "./referee-assigned";
export type { RefereeSlotsPushPayload } from "./referee-slots";
export type { MatchCancelledPayload } from "./match-cancelled";
export type { MatchRescheduledPayload } from "./match-rescheduled";
