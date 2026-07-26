import { EVENT_TYPES } from "@dragons/shared";
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
  renderMatchScheduleChangedPush,
  type MatchScheduleChangedPushPayload,
} from "./match-schedule-changed";

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
  // Cases are EVENT_TYPES constants, never restated string literals: this
  // switch used to key on "match.rescheduled", which is not a member of
  // EVENT_TYPES, so its template was unreachable dead code. Referencing the
  // constant makes any such name a compile error.
  switch (eventType) {
    case EVENT_TYPES.REFEREE_ASSIGNED:
      return renderRefereeAssignedPush(payload as unknown as RefereeAssignedPayload, locale);
    case EVENT_TYPES.REFEREE_UNASSIGNED:
      return renderRefereeUnassignedPush(payload as unknown as RefereeAssignedPayload, locale);
    case EVENT_TYPES.REFEREE_REASSIGNED:
      return renderRefereeReassignedPush(payload as unknown as RefereeReassignedPushPayload, locale);
    case EVENT_TYPES.REFEREE_SLOTS_NEEDED:
      return renderRefereeSlotsPush(payload as unknown as RefereeSlotsPushPayload, locale, "needed");
    case EVENT_TYPES.REFEREE_SLOTS_REMINDER:
      return renderRefereeSlotsPush(payload as unknown as RefereeSlotsPushPayload, locale, "reminder");
    case EVENT_TYPES.MATCH_CANCELLED:
      return renderMatchCancelledPush(payload as unknown as MatchCancelledPayload, locale);
    case EVENT_TYPES.MATCH_SCHEDULE_CHANGED:
      return renderMatchScheduleChangedPush(
        payload as unknown as MatchScheduleChangedPushPayload,
        locale,
      );
    default:
      return null;
  }
}

export type { PushTemplateOutput, Locale } from "./types";
