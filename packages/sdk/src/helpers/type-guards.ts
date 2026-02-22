import type { SdkLiga } from "../types/liga";
import type { SdkSpielplanMatch } from "../types/match";
import type { SdkTabelleEntry } from "../types/standings";

export function isSdkLiga(value: unknown): value is SdkLiga {
  return (
    typeof value === "object" &&
    value !== null &&
    "ligaId" in value &&
    typeof (value as SdkLiga).ligaId === "number" &&
    "liganr" in value &&
    typeof (value as SdkLiga).liganr === "number"
  );
}

export function isSdkSpielplanMatch(value: unknown): value is SdkSpielplanMatch {
  return (
    typeof value === "object" &&
    value !== null &&
    "matchId" in value &&
    typeof (value as SdkSpielplanMatch).matchId === "number"
  );
}

export function isSdkTabelleEntry(value: unknown): value is SdkTabelleEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    "rang" in value &&
    typeof (value as SdkTabelleEntry).rang === "number" &&
    "team" in value
  );
}
