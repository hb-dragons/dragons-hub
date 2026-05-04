import type { RenderedMessage } from "./match";
import { tryRenderEvent } from "./render-chain";

export interface DigestItem {
  eventType: string;
  payload: Record<string, unknown>;
  entityName: string;
  deepLinkPath: string;
  urgency: string;
  occurredAt: Date;
}

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
    const rendered = tryRenderEvent(
      item.eventType,
      item.payload,
      item.entityName,
      locale,
    );
    return `- ${rendered.title}`;
  });

  return { title, body: lines.join("\n") };
}
