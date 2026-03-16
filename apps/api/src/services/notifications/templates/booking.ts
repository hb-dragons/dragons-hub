import { EVENT_TYPES } from "@dragons/shared";
import type { RenderedMessage } from "./match";

/**
 * Format a date string (YYYY-MM-DD) as DD.MM. for German display
 * or MM/DD for English. Uses string splitting to avoid timezone issues.
 */
function formatDate(dateStr: string, locale: string): string {
  const parts = dateStr.split("-");
  if (parts.length < 3) return dateStr;
  const [, month, day] = parts;
  if (locale === "de") {
    return `${day}.${month}.`;
  }
  return `${month}/${day}`;
}

const bookingRenderers: Record<
  string,
  (
    payload: Record<string, unknown>,
    entityName: string,
    locale: string,
  ) => RenderedMessage
> = {
  [EVENT_TYPES.BOOKING_CREATED]: (payload, _entityName, locale) => {
    const venue = String(payload.venueName ?? "?");
    const date = payload.date ? formatDate(String(payload.date), locale) : "";
    const start = String(payload.startTime ?? "");
    const end = String(payload.endTime ?? "");

    return locale === "de"
      ? {
          title: `\u{1F4C5} Neue Hallenbuchung`,
          body: `${venue} am ${date}, ${start}\u{2013}${end}`,
        }
      : {
          title: `\u{1F4C5} New booking`,
          body: `${venue} on ${date}, ${start}\u{2013}${end}`,
        };
  },

  [EVENT_TYPES.BOOKING_TIME_CHANGED]: (payload, _entityName, locale) => {
    const venue = String(payload.venueName ?? "?");
    const date = payload.date ? formatDate(String(payload.date), locale) : "";
    const oldTime = `${String(payload.oldStartTime ?? "")}\u{2013}${String(payload.oldEndTime ?? "")}`;
    const newTime = `${String(payload.newStartTime ?? "")}\u{2013}${String(payload.newEndTime ?? "")}`;

    return locale === "de"
      ? {
          title: `\u{1F4C5} Buchungszeit ge\u{00E4}ndert`,
          body: `${venue} am ${date}: ${newTime} (vorher: ${oldTime})`,
        }
      : {
          title: `\u{1F4C5} Booking time changed`,
          body: `${venue} on ${date}: ${newTime} (was: ${oldTime})`,
        };
  },

  [EVENT_TYPES.BOOKING_CANCELLED]: (payload, _entityName, locale) => {
    const venue = String(payload.venueName ?? "?");
    const date = payload.date ? formatDate(String(payload.date), locale) : "";
    const reason = payload.reason ? ` (${String(payload.reason)})` : "";

    return locale === "de"
      ? {
          title: `\u{274C} Buchung storniert`,
          body: `${venue} am ${date} wurde storniert.${reason}`,
        }
      : {
          title: `\u{274C} Booking cancelled`,
          body: `${venue} on ${date} has been cancelled.${reason}`,
        };
  },

  [EVENT_TYPES.BOOKING_NEEDS_RECONFIRMATION]: (payload, _entityName, locale) => {
    const venue = String(payload.venueName ?? "?");
    const date = payload.date ? formatDate(String(payload.date), locale) : "";
    const reason = payload.reason ? ` ${String(payload.reason)}` : "";

    return locale === "de"
      ? {
          title: `\u{26A0}\u{FE0F} R\u{00FC}ckbest\u{00E4}tigung n\u{00F6}tig`,
          body: `${venue} am ${date} muss r\u{00FC}ckbest\u{00E4}tigt werden.${reason}`,
        }
      : {
          title: `\u{26A0}\u{FE0F} Reconfirmation needed`,
          body: `${venue} on ${date} needs reconfirmation.${reason}`,
        };
  },
};

export function renderBookingMessage(
  eventType: string,
  payload: Record<string, unknown>,
  entityName: string,
  locale: string,
): RenderedMessage | null {
  const renderer = bookingRenderers[eventType];
  if (!renderer) return null;
  return renderer(payload, entityName, locale);
}
