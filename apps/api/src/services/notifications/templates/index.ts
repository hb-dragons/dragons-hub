import type { RenderedMessage } from "./match";
import { renderMatchMessage } from "./match";
import { renderRefereeMessage } from "./referee";
import { renderBookingMessage } from "./booking";
import { renderOverrideMessage } from "./override";

export type { RenderedMessage } from "./match";
export { renderDigestMessage } from "./digest";
export type { DigestItem } from "./digest";

/**
 * Route an event type to the appropriate template renderer and produce
 * a locale-aware { title, body } message.
 *
 * Returns a fallback message if no specific renderer handles the event type.
 */
export function renderEventMessage(
  eventType: string,
  payload: Record<string, unknown>,
  entityName: string,
  locale: string,
): RenderedMessage {
  // Try each domain renderer in order
  const result =
    renderMatchMessage(eventType, payload, entityName, locale) ??
    renderRefereeMessage(eventType, payload, entityName, locale) ??
    renderBookingMessage(eventType, payload, entityName, locale) ??
    renderOverrideMessage(eventType, payload, entityName, locale);

  if (result) return result;

  // Fallback for unknown event types
  return locale === "de"
    ? { title: `Ereignis: ${eventType}`, body: entityName }
    : { title: `Event: ${eventType}`, body: entityName };
}
