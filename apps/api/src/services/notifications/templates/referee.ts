import { EVENT_TYPES } from "@dragons/shared";
import type { RenderedMessage } from "./match";

const refereeRenderers: Record<
  string,
  (
    payload: Record<string, unknown>,
    entityName: string,
    locale: string,
  ) => RenderedMessage
> = {
  [EVENT_TYPES.REFEREE_ASSIGNED]: (payload, _entityName, locale) => {
    const ref = String(payload.refereeName ?? "?");
    const role = String(payload.role ?? "");
    const match = `${String(payload.homeTeam ?? "")} vs ${String(payload.guestTeam ?? "")}`;

    return locale === "de"
      ? {
          title: `\u{1F9D1}\u{200D}\u{2696}\u{FE0F} Schiedsrichter eingeteilt`,
          body: `${ref} (${role}) wurde f\u{00FC}r ${match} eingeteilt.`,
        }
      : {
          title: `\u{1F9D1}\u{200D}\u{2696}\u{FE0F} Referee assigned`,
          body: `${ref} (${role}) has been assigned to ${match}.`,
        };
  },

  [EVENT_TYPES.REFEREE_UNASSIGNED]: (payload, _entityName, locale) => {
    const ref = String(payload.refereeName ?? "?");
    const role = String(payload.role ?? "");
    const match = `${String(payload.homeTeam ?? "")} vs ${String(payload.guestTeam ?? "")}`;

    return locale === "de"
      ? {
          title: `\u{1F9D1}\u{200D}\u{2696}\u{FE0F} Schiedsrichter abgesetzt`,
          body: `${ref} (${role}) wurde von ${match} abgesetzt.`,
        }
      : {
          title: `\u{1F9D1}\u{200D}\u{2696}\u{FE0F} Referee unassigned`,
          body: `${ref} (${role}) has been removed from ${match}.`,
        };
  },

  [EVENT_TYPES.REFEREE_REASSIGNED]: (payload, _entityName, locale) => {
    const oldRef = String(payload.oldRefereeName ?? "?");
    const newRef = String(payload.newRefereeName ?? "?");
    const role = String(payload.role ?? "");
    const match = `${String(payload.homeTeam ?? "")} vs ${String(payload.guestTeam ?? "")}`;

    return locale === "de"
      ? {
          title: `\u{1F9D1}\u{200D}\u{2696}\u{FE0F} Schiedsrichterwechsel`,
          body: `${match}: ${newRef} ersetzt ${oldRef} (${role}).`,
        }
      : {
          title: `\u{1F9D1}\u{200D}\u{2696}\u{FE0F} Referee reassigned`,
          body: `${match}: ${newRef} replaces ${oldRef} (${role}).`,
        };
  },

  [EVENT_TYPES.REFEREE_SLOTS_NEEDED]: (payload, _entityName, locale) => {
    const home = String(payload.homeTeam ?? "");
    const guest = String(payload.guestTeam ?? "");
    const match = `${home} vs ${guest}`;

    return locale === "de"
      ? {
          title: "🏀 Schiedsrichter gesucht",
          body: `${match} braucht noch Schiedsrichter.`,
        }
      : {
          title: "🏀 Referees needed",
          body: `${match} still needs referees.`,
        };
  },

  [EVENT_TYPES.REFEREE_SLOTS_REMINDER]: (payload, _entityName, locale) => {
    const home = String(payload.homeTeam ?? "");
    const guest = String(payload.guestTeam ?? "");
    const match = `${home} vs ${guest}`;
    const days = Number(payload.reminderLevel ?? 0);

    return locale === "de"
      ? {
          title: "⚠️ Erinnerung: Schiedsrichter benötigt",
          body: `${match} in ${days} Tagen braucht noch Schiedsrichter.`,
        }
      : {
          title: "⚠️ Reminder: Referees needed",
          body: `${match} in ${days} days still needs referees.`,
        };
  },
};

export function renderRefereeMessage(
  eventType: string,
  payload: Record<string, unknown>,
  entityName: string,
  locale: string,
): RenderedMessage | null {
  const renderer = refereeRenderers[eventType];
  if (!renderer) return null;
  return renderer(payload, entityName, locale);
}
