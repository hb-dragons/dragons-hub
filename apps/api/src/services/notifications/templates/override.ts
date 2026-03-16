import { EVENT_TYPES } from "@dragons/shared";
import type { RenderedMessage } from "./match";

const overrideRenderers: Record<
  string,
  (
    payload: Record<string, unknown>,
    entityName: string,
    locale: string,
  ) => RenderedMessage
> = {
  [EVENT_TYPES.OVERRIDE_APPLIED]: (payload, _entityName, locale) => {
    const field = String(payload.field ?? "?");
    const match = `${String(payload.homeTeam ?? "")} vs ${String(payload.guestTeam ?? "")}`;
    const from = String(payload.originalValue ?? "?");
    const to = String(payload.overrideValue ?? "?");
    const by = String(payload.appliedBy ?? "?");

    return locale === "de"
      ? {
          title: `\u{1F6E0}\u{FE0F} Override angewendet`,
          body: `${match}: ${field} von ${from} auf ${to} ge\u{00E4}ndert (durch ${by}).`,
        }
      : {
          title: `\u{1F6E0}\u{FE0F} Override applied`,
          body: `${match}: ${field} changed from ${from} to ${to} (by ${by}).`,
        };
  },

  [EVENT_TYPES.OVERRIDE_REVERTED]: (payload, _entityName, locale) => {
    const field = String(payload.field ?? "?");
    const match = `${String(payload.homeTeam ?? "")} vs ${String(payload.guestTeam ?? "")}`;
    const by = String(payload.revertedBy ?? "?");

    return locale === "de"
      ? {
          title: `\u{1F6E0}\u{FE0F} Override zur\u{00FC}ckgesetzt`,
          body: `${match}: Override f\u{00FC}r ${field} wurde zur\u{00FC}ckgesetzt (durch ${by}).`,
        }
      : {
          title: `\u{1F6E0}\u{FE0F} Override reverted`,
          body: `${match}: Override for ${field} has been reverted (by ${by}).`,
        };
  },
};

export function renderOverrideMessage(
  eventType: string,
  payload: Record<string, unknown>,
  entityName: string,
  locale: string,
): RenderedMessage | null {
  const renderer = overrideRenderers[eventType];
  if (!renderer) return null;
  return renderer(payload, entityName, locale);
}
