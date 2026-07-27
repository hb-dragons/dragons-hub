import type { RenderedMessage } from "./match";

/**
 * The two MIME parts of one outgoing notification email.
 *
 * Both are always produced. The event templates render `{title, body}` plain
 * text, which is the only thing a text-only reader (or a spam filter that
 * distrusts HTML-only mail) can show, so `text` stays the authoritative
 * content and `html` is a formatted view of exactly the same words — never
 * extra information the text part is missing.
 */
export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const FOOTER = {
  de: "Diese Nachricht wurde automatisch von Dragons Hub gesendet.",
  en: "This message was sent automatically by Dragons Hub.",
} as const;

const LINK_LABEL = {
  de: "In Dragons Hub öffnen",
  en: "Open in Dragons Hub",
} as const;

function localeKey(locale: string): "de" | "en" {
  return locale.toLowerCase().startsWith("en") ? "en" : "de";
}

/**
 * Escape the five characters that can break out of HTML text or an attribute.
 * Event bodies interpolate federation-supplied strings (team names, venue
 * names), so they are never safe to drop into markup unescaped.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Turn the text body's blank-line-separated blocks into `<p>` + `<br>`. */
function bodyToHtml(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((block) => escapeHtml(block).split("\n").join("<br />"))
    .map((block) => `<p style="margin:0 0 12px;">${block}</p>`)
    .join("");
}

/**
 * Build both MIME parts from an already-rendered event message.
 *
 * `link` is optional: only events carrying a deep link get a call to action,
 * and it is rendered into both parts so the text reader is not sent looking for
 * a button that only exists in the HTML.
 */
export function renderEmailMessage(
  message: RenderedMessage,
  locale: string,
  link?: string,
): RenderedEmail {
  const key = localeKey(locale);

  const text = link
    ? `${message.body}\n\n${LINK_LABEL[key]}: ${link}\n\n${FOOTER[key]}`
    : `${message.body}\n\n${FOOTER[key]}`;

  const linkHtml = link
    ? `<p style="margin:0 0 12px;"><a href="${escapeHtml(link)}">${LINK_LABEL[key]}</a></p>`
    : "";

  // Inline styles, no <head>, no external assets: mail clients strip <style>
  // blocks and block remote loads, so anything not inline does not survive.
  const html = [
    `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;">`,
    `<h1 style="font-size:18px;margin:0 0 12px;">${escapeHtml(message.title)}</h1>`,
    bodyToHtml(message.body),
    linkHtml,
    `<p style="margin:16px 0 0;font-size:12px;color:#666666;">${FOOTER[key]}</p>`,
    `</div>`,
  ].join("");

  return { subject: message.title, text, html };
}
