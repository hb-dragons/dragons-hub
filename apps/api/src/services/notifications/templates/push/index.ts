import type { Locale, PushTemplateOutput } from "./types";
import {
  renderRefereeAssignedPush,
  type RefereeAssignedPayload,
} from "./referee-assigned";
import { renderRefereeUnassignedPush } from "./referee-unassigned";
import { renderRefereeReassignedPush } from "./referee-reassigned";
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
}

/**
 * Returns null when the event type has no push template.
 */
export function renderPushTemplate(args: RenderArgs): PushTemplateOutput | null {
  const { eventType, payload, locale } = args;
  switch (eventType) {
    case "referee.assigned":
      return renderRefereeAssignedPush(payload as unknown as RefereeAssignedPayload, locale);
    case "referee.unassigned":
      return renderRefereeUnassignedPush(payload as unknown as RefereeAssignedPayload, locale);
    case "referee.reassigned":
      return renderRefereeReassignedPush(payload as unknown as RefereeAssignedPayload, locale);
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
