import type { SdkLiga } from "../types/liga";
import type { SdkSpielplanMatch } from "../types/match";
import type { SdkTabelleEntry } from "../types/standings";
import type { SdkTeamRef } from "../types/common";

/**
 * Runtime guards for the federation payloads.
 *
 * A guard that checks one field out of eighteen is worse than no guard: it
 * hands the caller a narrowed type whose other seventeen fields may not exist,
 * and the failure surfaces later as `Cannot read properties of undefined`
 * somewhere in the sync pipeline. Each guard below therefore checks *every*
 * field its interface declares, with the same nullability the interface does.
 *
 * The `it("accepts every … in the recorded sample")` cases in
 * `type-guards.test.ts` run these against `src/samples/*.json` (real recorded
 * responses), so tightening a guard past what the API actually sends fails the
 * build rather than silently dropping live data.
 */

type Rec = Record<string, unknown>;

function isRecord(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isNumber = (v: unknown): boolean => typeof v === "number";
const isString = (v: unknown): boolean => typeof v === "string";
const isBoolean = (v: unknown): boolean => typeof v === "boolean";
const nullable =
  (check: (v: unknown) => boolean) =>
  (v: unknown): boolean =>
    v === null || check(v);

/**
 * Every key must be present *and* satisfy its check — `undefined` fails every
 * check below, so a missing key is a rejection rather than a silent `any`.
 */
function hasFields(value: Rec, checks: Record<string, (v: unknown) => boolean>): boolean {
  return Object.entries(checks).every(([key, check]) => key in value && check(value[key]));
}

/** `SdkTeamRef` — the nested shape `matches[].homeTeam` and `tabelle.entries[].team` carry. */
export function isSdkTeamRef(value: unknown): value is SdkTeamRef {
  return (
    isRecord(value) &&
    hasFields(value, {
      seasonTeamId: isNumber,
      teamCompetitionId: isNumber,
      teamPermanentId: isNumber,
      teamname: isString,
      teamnameSmall: isString,
      clubId: isNumber,
      verzicht: isBoolean,
    })
  );
}

export function isSdkLiga(value: unknown): value is SdkLiga {
  return (
    isRecord(value) &&
    hasFields(value, {
      ligaId: isNumber,
      liganr: isNumber,
      liganame: isString,
      seasonId: nullable(isNumber),
      seasonName: nullable(isString),
      actualMatchDay: nullable(isNumber),
      skName: isString,
      skNameSmall: isString,
      skEbeneId: isNumber,
      skEbeneName: isString,
      akName: isString,
      geschlechtId: isNumber,
      geschlecht: isString,
      verbandId: isNumber,
      verbandName: isString,
      bezirknr: nullable(isString),
      bezirkName: nullable(isString),
      kreisnr: nullable(isString),
      kreisname: nullable(isString),
      statisticType: nullable(isNumber),
      vorabliga: isBoolean,
      tableExists: nullable(isBoolean),
      crossTableExists: nullable(isBoolean),
    })
  );
}

export function isSdkSpielplanMatch(value: unknown): value is SdkSpielplanMatch {
  return (
    isRecord(value) &&
    hasFields(value, {
      // `ligaData` is a nested SdkLigaData; the live spielplan sends null for it
      // on every match, so presence + object-or-null is as far as this goes.
      ligaData: nullable(isRecord),
      matchId: isNumber,
      matchDay: isNumber,
      matchNo: isNumber,
      kickoffDate: isString,
      kickoffTime: isString,
      // Null for a TBD slot — data-fetcher.ts already treats that as "no team".
      homeTeam: nullable(isSdkTeamRef),
      guestTeam: nullable(isSdkTeamRef),
      result: nullable(isString),
      ergebnisbestaetigt: isBoolean,
      statisticType: nullable(isNumber),
      verzicht: isBoolean,
      abgesagt: isBoolean,
      // Declared `unknown | null`: presence is all that can be asserted.
      matchResult: () => true,
      matchInfo: () => true,
      matchBoxscore: () => true,
      playByPlay: () => true,
      hasPlayByPlay: nullable(isBoolean),
    })
  );
}

export function isSdkTabelleEntry(value: unknown): value is SdkTabelleEntry {
  return (
    isRecord(value) &&
    hasFields(value, {
      rang: isNumber,
      // Non-nullable in the interface: a standings row without a team is not a
      // standings row, and `{rang: 1, team: null}` used to pass this guard.
      team: isSdkTeamRef,
      anzspiele: isNumber,
      anzGewinnpunkte: isNumber,
      anzVerlustpunkte: isNumber,
      s: isNumber,
      n: isNumber,
      koerbe: isNumber,
      gegenKoerbe: isNumber,
      korbdiff: isNumber,
    })
  );
}
