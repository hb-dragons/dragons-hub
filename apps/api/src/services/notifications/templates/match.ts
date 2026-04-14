import { EVENT_TYPES } from "@dragons/shared";
import { formatDate } from "./utils";

export interface RenderedMessage {
  title: string;
  body: string;
}

const matchRenderers: Record<
  string,
  (
    payload: Record<string, unknown>,
    entityName: string,
    locale: string,
  ) => RenderedMessage
> = {
  [EVENT_TYPES.MATCH_SCHEDULE_CHANGED]: (payload, entityName, locale) => {
    const changes = payload.changes as
      | Array<{ field: string; oldValue: unknown; newValue: unknown }>
      | undefined;

    let detail = "";
    if (changes && changes.length > 0) {
      const dateChange = changes.find(
        (c) => c.field === "kickoffDate" || c.field === "kickoffTime",
      );
      if (dateChange) {
        detail =
          locale === "de"
            ? `\nNeu: ${String(dateChange.newValue)} (vorher: ${String(dateChange.oldValue)})`
            : `\nNew: ${String(dateChange.newValue)} (was: ${String(dateChange.oldValue)})`;
      }
    }

    return locale === "de"
      ? {
          title: `\u{1F3C0} Spielverlegung: ${entityName}`,
          body: `${String(payload.homeTeam ?? "")} vs ${String(payload.guestTeam ?? "")} (${String(payload.leagueName ?? "")}) wurde verlegt.${detail}`,
        }
      : {
          title: `\u{1F3C0} Schedule change: ${entityName}`,
          body: `${String(payload.homeTeam ?? "")} vs ${String(payload.guestTeam ?? "")} (${String(payload.leagueName ?? "")}) has been rescheduled.${detail}`,
        };
  },

  [EVENT_TYPES.MATCH_VENUE_CHANGED]: (payload, _entityName, locale) => {
    const oldVenue = String(payload.oldVenueName ?? "?");
    const newVenue = String(payload.newVenueName ?? "?");

    return locale === "de"
      ? {
          title: `\u{1F3DF}\u{FE0F} Hallen\u{00E4}nderung`,
          body: `${String(payload.homeTeam ?? "")} vs ${String(payload.guestTeam ?? "")}: Neue Halle: ${newVenue} (vorher: ${oldVenue})`,
        }
      : {
          title: `\u{1F3DF}\u{FE0F} Venue change`,
          body: `${String(payload.homeTeam ?? "")} vs ${String(payload.guestTeam ?? "")}: New venue: ${newVenue} (was: ${oldVenue})`,
        };
  },

  [EVENT_TYPES.MATCH_CANCELLED]: (payload, _entityName, locale) => {
    const reason = payload.reason ? ` (${String(payload.reason)})` : "";

    return locale === "de"
      ? {
          title: `\u{26A1} Spielabsage`,
          body: `${String(payload.homeTeam ?? "")} vs ${String(payload.guestTeam ?? "")} (${String(payload.leagueName ?? "")}) wurde abgesagt.${reason}`,
        }
      : {
          title: `\u{26A1} Game cancelled`,
          body: `${String(payload.homeTeam ?? "")} vs ${String(payload.guestTeam ?? "")} (${String(payload.leagueName ?? "")}) has been cancelled.${reason}`,
        };
  },

  [EVENT_TYPES.MATCH_FORFEITED]: (payload, _entityName, locale) => {
    return locale === "de"
      ? {
          title: `\u{26A1} Spielwertung`,
          body: `${String(payload.homeTeam ?? "")} vs ${String(payload.guestTeam ?? "")} (${String(payload.leagueName ?? "")}) wurde gewertet.`,
        }
      : {
          title: `\u{26A1} Game forfeited`,
          body: `${String(payload.homeTeam ?? "")} vs ${String(payload.guestTeam ?? "")} (${String(payload.leagueName ?? "")}) has been forfeited.`,
        };
  },

  [EVENT_TYPES.MATCH_CREATED]: (payload, _entityName, locale) => {
    const date = payload.kickoffDate
      ? formatDate(String(payload.kickoffDate), locale)
      : "";
    const time = payload.kickoffTime ? ` ${String(payload.kickoffTime)}` : "";

    return locale === "de"
      ? {
          title: `\u{1F195} Neues Spiel`,
          body: `${String(payload.homeTeam ?? "")} vs ${String(payload.guestTeam ?? "")} (${String(payload.leagueName ?? "")}) am ${date}${time}`,
        }
      : {
          title: `\u{1F195} New game`,
          body: `${String(payload.homeTeam ?? "")} vs ${String(payload.guestTeam ?? "")} (${String(payload.leagueName ?? "")}) on ${date}${time}`,
        };
  },

  [EVENT_TYPES.MATCH_SCORE_CHANGED]: (payload, _entityName, locale) => {
    const score = `${String(payload.homeScore ?? "?")}:${String(payload.guestScore ?? "?")}`;
    const hadOldScore = payload.oldHomeScore != null && payload.oldGuestScore != null;

    if (hadOldScore) {
      const oldScore = `${String(payload.oldHomeScore ?? "?")}:${String(payload.oldGuestScore ?? "?")}`;
      return locale === "de"
        ? {
            title: `\u{1F4CA} Ergebnis\u{00E4}nderung`,
            body: `${String(payload.homeTeam ?? "")} vs ${String(payload.guestTeam ?? "")} (${String(payload.leagueName ?? "")}): ${score} (vorher: ${oldScore})`,
          }
        : {
            title: `\u{1F4CA} Score correction`,
            body: `${String(payload.homeTeam ?? "")} vs ${String(payload.guestTeam ?? "")} (${String(payload.leagueName ?? "")}): ${score} (was: ${oldScore})`,
          };
    }

    return locale === "de"
      ? {
          title: `\u{1F4CA} Ergebnis`,
          body: `${String(payload.homeTeam ?? "")} vs ${String(payload.guestTeam ?? "")} (${String(payload.leagueName ?? "")}): ${score}`,
        }
      : {
          title: `\u{1F4CA} Score update`,
          body: `${String(payload.homeTeam ?? "")} vs ${String(payload.guestTeam ?? "")} (${String(payload.leagueName ?? "")}): ${score}`,
        };
  },

  [EVENT_TYPES.MATCH_RESULT_ENTERED]: (payload, _entityName, locale) => {
    const score = `${String(payload.homeScore ?? "?")}:${String(payload.guestScore ?? "?")}`;

    return locale === "de"
      ? {
          title: `\u{1F4CA} Ergebnis`,
          body: `${String(payload.homeTeam ?? "")} vs ${String(payload.guestTeam ?? "")} (${String(payload.leagueName ?? "")}): ${score}`,
        }
      : {
          title: `\u{1F4CA} Score update`,
          body: `${String(payload.homeTeam ?? "")} vs ${String(payload.guestTeam ?? "")} (${String(payload.leagueName ?? "")}): ${score}`,
        };
  },

  [EVENT_TYPES.MATCH_RESULT_CHANGED]: (payload, _entityName, locale) => {
    const oldScore = `${String(payload.oldHomeScore ?? "?")}:${String(payload.oldGuestScore ?? "?")}`;
    const newScore = `${String(payload.newHomeScore ?? "?")}:${String(payload.newGuestScore ?? "?")}`;

    return locale === "de"
      ? {
          title: `\u{1F4CA} Ergebnis\u{00E4}nderung`,
          body: `${String(payload.homeTeam ?? "")} vs ${String(payload.guestTeam ?? "")} (${String(payload.leagueName ?? "")}): ${newScore} (vorher: ${oldScore})`,
        }
      : {
          title: `\u{1F4CA} Score correction`,
          body: `${String(payload.homeTeam ?? "")} vs ${String(payload.guestTeam ?? "")} (${String(payload.leagueName ?? "")}): ${newScore} (was: ${oldScore})`,
        };
  },

  [EVENT_TYPES.MATCH_CONFIRMED]: (payload, _entityName, locale) => {
    const score =
      payload.homeScore != null && payload.guestScore != null
        ? ` (${String(payload.homeScore)}:${String(payload.guestScore)})`
        : "";

    return locale === "de"
      ? {
          title: `\u{2705} Ergebnis best\u{00E4}tigt`,
          body: `${String(payload.homeTeam ?? "")} vs ${String(payload.guestTeam ?? "")} (${String(payload.leagueName ?? "")})${score} wurde offiziell best\u{00E4}tigt.`,
        }
      : {
          title: `\u{2705} Result confirmed`,
          body: `${String(payload.homeTeam ?? "")} vs ${String(payload.guestTeam ?? "")} (${String(payload.leagueName ?? "")})${score} has been officially confirmed.`,
        };
  },

  [EVENT_TYPES.MATCH_REMOVED]: (_payload, entityName, locale) => {
    return locale === "de"
      ? {
          title: `\u{274C} Spiel entfernt`,
          body: `${entityName} wurde aus dem Spielplan entfernt.`,
        }
      : {
          title: `\u{274C} Match removed`,
          body: `${entityName} has been removed from the schedule.`,
        };
  },
};

export function renderMatchMessage(
  eventType: string,
  payload: Record<string, unknown>,
  entityName: string,
  locale: string,
): RenderedMessage | null {
  const renderer = matchRenderers[eventType];
  if (!renderer) return null;
  return renderer(payload, entityName, locale);
}
