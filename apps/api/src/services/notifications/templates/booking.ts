import { EVENT_TYPES } from "@dragons/shared";
import type { RenderedMessage } from "./match";
import { formatDate } from "./utils";

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

  [EVENT_TYPES.BOOKING_STATUS_CHANGED]: (payload, _entityName, locale) => {
    const venue = String(payload.venueName ?? "?");
    const date = payload.date ? formatDate(String(payload.date), locale) : "";

    // Time change variant
    if (payload.oldStartTime || payload.newStartTime) {
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
    }

    // Status change variant (e.g. cancelled)
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

  [EVENT_TYPES.BOOKING_HALL_TIME_MISSING]: (payload, _entityName, locale) => {
    const venue = String(payload.venueName ?? "?");
    const date = payload.date ? formatDate(String(payload.date), locale) : "";
    const window = `${String(payload.startTime ?? "").slice(0, 5)}\u{2013}${String(payload.endTime ?? "").slice(0, 5)}`;
    const hallTime = payload.hallTime as
      | { kind?: string; startTime?: string | null; endTime?: string | null; note?: string | null }
      | null
      | undefined;
    const coverage = String(payload.coverage ?? "uncovered");

    let situation: string;
    if (coverage === "closed") {
      const note = hallTime?.note ? ` (${hallTime.note})` : "";
      situation = locale === "de" ? `Halle geschlossen${note}` : `hall closed${note}`;
    } else if (coverage === "partial" && hallTime?.startTime && hallTime.endTime) {
      const held = `${hallTime.startTime.slice(0, 5)}\u{2013}${hallTime.endTime.slice(0, 5)}`;
      situation = locale === "de" ? `Hallenzeit nur ${held}` : `hall time only ${held}`;
    } else {
      situation = locale === "de" ? "keine Hallenzeit" : "no hall time";
    }

    return locale === "de"
      ? {
          title: `\u{1F3DF}\u{FE0F} Mietantrag n\u{00F6}tig`,
          body: `${venue} am ${date}, ${window}: ${situation}.`,
        }
      : {
          title: `\u{1F3DF}\u{FE0F} Rental request needed`,
          body: `${venue} on ${date}, ${window}: ${situation}.`,
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
