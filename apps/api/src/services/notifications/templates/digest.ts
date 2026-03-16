import type { RenderedMessage } from "./match";

export interface DigestItem {
  title: string;
  body: string;
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
      ? `\u{1F4E8} Zusammenfassung: ${count} ${count === 1 ? "Ereignis" : "Ereignisse"}`
      : `\u{1F4E8} Digest: ${count} ${count === 1 ? "event" : "events"}`;

  const body = items.map((item) => `\u{2022} ${item.title}`).join("\n");

  return { title, body };
}
