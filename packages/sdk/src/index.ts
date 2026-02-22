// Types
export type {
  SdkClubSearchResult,
  SdkDiscoveredCompetition,
  SdkClubMatch,
  SdkClubMatchesResponse,
} from "./types/club";
export type { SdkLiga, SdkLigaListResponse, SdkLigaData } from "./types/liga";
export type {
  SdkMatchDayInfo,
  SdkTeamRef,
  SdkSpielfeld,
  SdkVerein,
  SdkMannschaft,
  SdkMannschaftLiga,
} from "./types/common";
export type { SdkSpielplanMatch, SdkSpielplanResponse } from "./types/match";
export type { SdkTabelleEntry, SdkTabelle, SdkTabelleResponse } from "./types/standings";
export type {
  SdkSchirirolle,
  SdkPersonVO,
  SdkSchiedsrichter,
  SdkSpielleitung,
  SdkRefereeSlot,
  SdkGameDetails,
  SdkGetGameResponse,
  SdkOpenGamesSearchParams,
  SdkOpenGame,
  SdkOpenGamesResponse,
  SdkUserContext,
  SdkUserContextResponse,
} from "./types/game-details";

// Helpers
export { parseResult } from "./helpers/parse-result";
export { isSdkLiga, isSdkSpielplanMatch, isSdkTabelleEntry } from "./helpers/type-guards";
