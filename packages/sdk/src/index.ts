// Types
/** @public — mirrors the federation API surface; see the note at the foot of this file. */
export type {
  SdkClubSearchResult,
  SdkClubMatch,
  SdkClubMatchesResponse,
} from "./types/club";
/** @public — mirrors the federation API surface; see the note at the foot of this file. */
export type { SdkLiga, SdkLigaListResponse, SdkLigaData } from "./types/liga";
/** @public — mirrors the federation API surface; see the note at the foot of this file. */
export type {
  SdkMatchDayInfo,
  SdkTeamRef,
  SdkSpielfeld,
  SdkVerein,
  SdkMannschaft,
  SdkMannschaftLiga,
} from "./types/common";
/** @public — mirrors the federation API surface; see the note at the foot of this file. */
export type { SdkSpielplanMatch, SdkSpielplanResponse } from "./types/match";
/** @public — mirrors the federation API surface; see the note at the foot of this file. */
export type { SdkTabelleEntry, SdkTabelle, SdkTabelleResponse } from "./types/standings";
/** @public — mirrors the federation API surface; see the note at the foot of this file. */
export type {
  SdkSchirirolle,
  SdkPersonVO,
  SdkSchiedsrichter,
  SdkSpielleitung,
  SdkRefereeSlot,
  SdkGameDetails,
  SdkGameLiga,
  SdkGetGameResponse,
  SdkOpenGamesSearchParams,
  SdkOffeneSpieleLiga,
  SdkOffeneSpieleSp,
  SdkOffeneSpielResult,
  SdkOffeneSpieleResponse,
  SdkUserContext,
  SdkUserContextResponse,
} from "./types/game-details";
/** @public — mirrors the federation API surface; see the note at the foot of this file. */
export type {
  SdkRefCandidateMeta,
  SdkRefCandidate,
  SdkGetRefsPayload,
  SdkGetRefsResponse,
  SdkAufheben,
  SdkSubmitSlotPayload,
  SdkSubmitPayload,
  SdkSubmitResponse,
} from "./types/referee-assignment";

// Helpers
export { parseResult } from "./helpers/parse-result";

/**
 * @public
 *
 * Not yet called from the sync boundary — `data-fetcher.ts` still trusts the
 * federation payloads it deserialises. That is a gap to close, not a sign these
 * are dead: knip reports them as unused exports for exactly that reason, and
 * the #120 sweep very nearly deleted them on that basis. The `@public` tag
 * silences the *missing caller*, not the guards, which stay live tested code
 * (`type-guards.test.ts`). Drop the tag once the boundary validation is wired.
 */
export {
  isSdkLiga,
  isSdkSpielplanMatch,
  isSdkTabelleEntry,
  isSdkTeamRef,
} from "./helpers/type-guards";
