import type { RenderedMessage } from "./match";
import { renderMatchMessage } from "./match";
import { renderRefereeMessage } from "./referee";
import { renderBookingMessage } from "./booking";
import { renderOverrideMessage } from "./override";
import { renderTaskMessage } from "./task";

export function tryRenderEvent(
  eventType: string,
  payload: Record<string, unknown>,
  entityName: string,
  locale: string,
): RenderedMessage {
  const result =
    renderMatchMessage(eventType, payload, entityName, locale) ??
    renderRefereeMessage(eventType, payload, entityName, locale) ??
    renderBookingMessage(eventType, payload, entityName, locale) ??
    renderOverrideMessage(eventType, payload, entityName, locale) ??
    renderTaskMessage(eventType, payload, entityName, locale);

  if (result) return result;

  return locale === "de"
    ? { title: `Ereignis: ${eventType}`, body: entityName }
    : { title: `Event: ${eventType}`, body: entityName };
}
