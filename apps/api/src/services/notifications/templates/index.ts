import type { RenderedMessage } from "./match";
import { tryRenderEvent } from "./render-chain";

export type { RenderedMessage } from "./match";

export function renderEventMessage(
  eventType: string,
  payload: Record<string, unknown>,
  entityName: string,
  locale: string,
): RenderedMessage {
  return tryRenderEvent(eventType, payload, entityName, locale);
}
