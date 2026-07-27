/**
 * The four pages the public unsubscribe endpoint can answer with.
 *
 * They are plain HTML served by the API rather than a screen in the Next.js
 * app, for one reason: this is the page a member reaches from a mail that may
 * be months old, and it has to work with no session, no JavaScript and no
 * second service being up. The form below is an ordinary POST — the member
 * pressing the button is the state change, and nothing on the page needs to
 * run for that to happen.
 */
export type UnsubscribePageKind =
  /** Token is valid and the member is still subscribed: ask before acting. */
  | "confirm"
  /** The opt-out has just been recorded. */
  | "done"
  /** The opt-out was already on file; the page says so rather than lying. */
  | "already"
  /** The token matches nothing. Served with 404 — never silently "done". */
  | "invalid";

export type UnsubscribeLocale = "de" | "en";

interface Copy {
  documentTitle: string;
  heading: string;
  body: string;
  scope: string;
  button?: string;
}

const COPY: Record<UnsubscribeLocale, Record<UnsubscribePageKind, Copy>> = {
  de: {
    confirm: {
      documentTitle: "E-Mail-Benachrichtigungen abbestellen",
      heading: "E-Mail-Benachrichtigungen abbestellen",
      body: "Möchtest du keine E-Mail-Benachrichtigungen von Dragons Hub mehr erhalten?",
      scope:
        "Betrifft nur E-Mail. Push-Benachrichtigungen und WhatsApp bleiben unverändert.",
      button: "Abbestellen",
    },
    done: {
      documentTitle: "Abbestellt",
      heading: "Abbestellt",
      body: "Du erhältst ab sofort keine E-Mail-Benachrichtigungen mehr von Dragons Hub.",
      scope:
        "Push-Benachrichtigungen und WhatsApp bleiben unverändert. Wenn du E-Mails wieder aktivieren möchtest, melde dich beim Verein.",
    },
    already: {
      documentTitle: "Bereits abbestellt",
      heading: "Bereits abbestellt",
      body: "Für diese Adresse sind E-Mail-Benachrichtigungen bereits deaktiviert. Es ist nichts weiter zu tun.",
      scope:
        "Push-Benachrichtigungen und WhatsApp bleiben unverändert. Wenn du E-Mails wieder aktivieren möchtest, melde dich beim Verein.",
    },
    invalid: {
      documentTitle: "Abmeldelink ungültig",
      heading: "Dieser Abmeldelink ist nicht gültig",
      body: "Der Link konnte keiner Person zugeordnet werden — möglicherweise wurde er beim Kopieren abgeschnitten.",
      scope:
        "Es wurde nichts geändert. Bitte öffne den Link direkt aus der E-Mail oder melde dich beim Verein, damit wir die Abmeldung von Hand eintragen.",
    },
  },
  en: {
    confirm: {
      documentTitle: "Unsubscribe from email notifications",
      heading: "Unsubscribe from email notifications",
      body: "Do you want to stop receiving email notifications from Dragons Hub?",
      scope: "This affects email only. Push notifications and WhatsApp are unchanged.",
      button: "Unsubscribe",
    },
    done: {
      documentTitle: "Unsubscribed",
      heading: "Unsubscribed",
      body: "You will not receive any further email notifications from Dragons Hub.",
      scope:
        "Push notifications and WhatsApp are unchanged. To turn email back on, contact the club.",
    },
    already: {
      documentTitle: "Already unsubscribed",
      heading: "Already unsubscribed",
      body: "Email notifications are already switched off for this address. Nothing further is needed.",
      scope:
        "Push notifications and WhatsApp are unchanged. To turn email back on, contact the club.",
    },
    invalid: {
      documentTitle: "Unsubscribe link not valid",
      heading: "This unsubscribe link is not valid",
      body: "The link could not be matched to anyone — it may have been truncated when it was copied.",
      scope:
        "Nothing was changed. Please open the link straight from the email, or contact the club so we can record the opt-out by hand.",
    },
  },
};

/** Escape the five characters that can break out of HTML text or an attribute. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render one page.
 *
 * `formAction` is only used by `confirm`, and only ever receives a URL built
 * from a token that was just found in the database — but it is escaped anyway,
 * because the alternative is a reflected-input hole one refactor away.
 */
export function renderUnsubscribePage(
  kind: UnsubscribePageKind,
  locale: UnsubscribeLocale,
  formAction?: string,
): string {
  const copy = COPY[locale][kind];
  const form =
    kind === "confirm" && formAction
      ? [
          `<form method="post" action="${escapeHtml(formAction)}">`,
          `<button type="submit" name="confirm" value="1" style="font:inherit;padding:10px 18px;border:0;border-radius:6px;background:#b3261e;color:#ffffff;cursor:pointer;">${escapeHtml(copy.button ?? "")}</button>`,
          `</form>`,
        ].join("")
      : "";

  return [
    "<!doctype html>",
    `<html lang="${locale}">`,
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    '<meta name="robots" content="noindex, nofollow" />',
    `<title>${escapeHtml(copy.documentTitle)}</title>`,
    "</head>",
    '<body style="margin:0;padding:32px;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a;background:#f5f5f5;">',
    '<main style="max-width:520px;margin:0 auto;padding:24px;background:#ffffff;border-radius:10px;">',
    `<h1 style="font-size:20px;margin:0 0 12px;">${escapeHtml(copy.heading)}</h1>`,
    `<p style="margin:0 0 12px;">${escapeHtml(copy.body)}</p>`,
    `<p style="margin:0 0 20px;font-size:14px;color:#555555;">${escapeHtml(copy.scope)}</p>`,
    form,
    "</main>",
    "</body>",
    "</html>",
  ].join("");
}
