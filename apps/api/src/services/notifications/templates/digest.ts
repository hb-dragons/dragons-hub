import type { RenderedMessage } from "./match";
import { renderMatchMessage } from "./match";
import { renderRefereeMessage } from "./referee";
import { renderBookingMessage } from "./booking";
import { renderOverrideMessage } from "./override";

export interface DigestItem {
  eventType: string;
  payload: Record<string, unknown>;
  entityName: string;
  deepLinkPath: string;
  urgency: string;
  occurredAt: Date;
}

/**
 * Render a single event to { title, body } using the same chain as
 * renderEventMessage, but without importing index.ts (avoids circular deps).
 */
function renderSingleEvent(
  eventType: string,
  payload: Record<string, unknown>,
  entityName: string,
  locale: string,
): RenderedMessage {
  const result =
    renderMatchMessage(eventType, payload, entityName, locale) ??
    renderRefereeMessage(eventType, payload, entityName, locale) ??
    renderBookingMessage(eventType, payload, entityName, locale) ??
    renderOverrideMessage(eventType, payload, entityName, locale);

  if (result) return result;

  return locale === "de"
    ? { title: `Ereignis: ${eventType}`, body: entityName }
    : { title: `Event: ${eventType}`, body: entityName };
}

/**
 * Render a digest message from a list of buffered domain events.
 *
 * Each item is rendered through the standard event template pipeline,
 * then combined into a single summary message.
 */
export function renderDigestMessage(
  items: DigestItem[],
  locale: string,
): RenderedMessage {
  if (items.length === 0) {
    return locale === "de"
      ? { title: "Zusammenfassung", body: "Keine neuen Ereignisse." }
      : { title: "Digest", body: "No new events." };
  }

  const count = items.length;
  const title =
    locale === "de"
      ? `Zusammenfassung: ${count} ${count === 1 ? "Ereignis" : "Ereignisse"}`
      : `Digest: ${count} ${count === 1 ? "event" : "events"}`;

  const lines = items.map((item) => {
    const rendered = renderSingleEvent(
      item.eventType,
      item.payload,
      item.entityName,
      locale,
    );
    return `- ${rendered.title}`;
  });

  return { title, body: lines.join("\n") };
}
