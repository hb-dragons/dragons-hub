import { EVENT_TYPES } from "@dragons/shared";
import type { EventPayload, EventType } from "@dragons/shared";
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
  type MatchCancelledPushPayload,
} from "./match-cancelled";
import {
  renderMatchScheduleChangedPush,
  type MatchScheduleChangedPushPayload,
} from "./match-schedule-changed";

// ── Payload-shape contract ───────────────────────────────────────────────────
//
// Event names are already tied to EVENT_TYPES (#101), so a typo'd event name is
// a compile error. Payload *shapes* had no such tie, which is why the same
// defect recurred one template later (#124): `match-cancelled.ts` demanded
// `matchId`/`kickoffDate`/`kickoffTime` that no emit site publishes, so the
// template threw out of dispatch. The table below closes that gap — each
// template's payload type is checked against the canonical payload schema in
// `@dragons/shared` (the one `validateEventPayload` enforces at publish time),
// so a template that requires a field producers are not contracted to send, or
// names a field the schema does not declare at all, fails to compile.

interface PushPayloadByEvent {
  [EVENT_TYPES.REFEREE_ASSIGNED]: RefereeAssignedPayload;
  [EVENT_TYPES.REFEREE_UNASSIGNED]: RefereeAssignedPayload;
  [EVENT_TYPES.REFEREE_REASSIGNED]: RefereeReassignedPushPayload;
  [EVENT_TYPES.REFEREE_SLOTS_NEEDED]: RefereeSlotsPushPayload;
  [EVENT_TYPES.REFEREE_SLOTS_REMINDER]: RefereeSlotsPushPayload;
  [EVENT_TYPES.MATCH_CANCELLED]: MatchCancelledPushPayload;
  [EVENT_TYPES.MATCH_SCHEDULE_CHANGED]: MatchScheduleChangedPushPayload;
}

/** The event types whose published payload does not satisfy their template. */
type Unrenderable = {
  [E in keyof PushPayloadByEvent]: EventPayload<E & EventType> extends PushPayloadByEvent[E]
    ? never
    : E;
}[keyof PushPayloadByEvent];

// Compile error naming the offending event type(s) if a template and its
// producers' contract drift apart.
type AssertNone<T extends never> = T;
type _PushPayloadContract = AssertNone<Unrenderable>;

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
      return renderRefereeAssignedPush(payloadOf(EVENT_TYPES.REFEREE_ASSIGNED, payload), locale);
    case EVENT_TYPES.REFEREE_UNASSIGNED:
      return renderRefereeUnassignedPush(payloadOf(EVENT_TYPES.REFEREE_UNASSIGNED, payload), locale);
    case EVENT_TYPES.REFEREE_REASSIGNED:
      return renderRefereeReassignedPush(payloadOf(EVENT_TYPES.REFEREE_REASSIGNED, payload), locale);
    case EVENT_TYPES.REFEREE_SLOTS_NEEDED:
      return renderRefereeSlotsPush(
        payloadOf(EVENT_TYPES.REFEREE_SLOTS_NEEDED, payload),
        locale,
        "needed",
      );
    case EVENT_TYPES.REFEREE_SLOTS_REMINDER:
      return renderRefereeSlotsPush(
        payloadOf(EVENT_TYPES.REFEREE_SLOTS_REMINDER, payload),
        locale,
        "reminder",
      );
    case EVENT_TYPES.MATCH_CANCELLED:
      return renderMatchCancelledPush(payloadOf(EVENT_TYPES.MATCH_CANCELLED, payload), locale);
    case EVENT_TYPES.MATCH_SCHEDULE_CHANGED:
      return renderMatchScheduleChangedPush(
        payloadOf(EVENT_TYPES.MATCH_SCHEDULE_CHANGED, payload),
        locale,
      );
    default:
      return null;
  }
}

/**
 * Narrows a dispatched payload to the template type registered for that event.
 * The cast is unavoidable — the payload is untyped JSON off the event row — but
 * routing it through the table means a case added to the switch without an entry
 * in `PushPayloadByEvent` does not compile, so no template can skip the contract
 * check above.
 */
function payloadOf<E extends keyof PushPayloadByEvent>(
  _eventType: E,
  payload: Record<string, unknown>,
): PushPayloadByEvent[E] {
  return payload as unknown as PushPayloadByEvent[E];
}

export type { PushTemplateOutput, Locale } from "./types";
