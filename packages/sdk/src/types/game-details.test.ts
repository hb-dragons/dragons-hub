import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SdkGameDetails, SdkGameLiga } from "./game-details";

const SAMPLES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../samples");

function sample(): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(SAMPLES, "getGameDetails.json"), "utf8")) as Record<
    string,
    unknown
  >;
}

/**
 * Every key the live `getGameDetails` response carries on `game1`.
 *
 * The `satisfies` below makes TypeScript reject any entry that is not declared
 * on `SdkGameDetails`, and the test below makes vitest reject any recorded key
 * that is missing from this list. Together they mean the interface cannot drift
 * from the recorded payload without something failing: that drift is how
 * `abgesagt` / `verzicht` / `ergebnisbestaetigt` came to be absent from the
 * type while `matches.sync.ts` needed them.
 */
const RECORDED_GAME1_KEYS = [
  "abgesagt",
  "ats",
  "dssUseraccountId",
  "ergebnisVon",
  "ergebnisbestaetigt",
  "gastEndstand",
  "gastHalbzeitstand",
  "gastMannschaftLiga",
  "gastOt1stand",
  "gastOt2stand",
  "gastV1stand",
  "gastV3stand",
  "gastV4stand",
  "heimEndstand",
  "heimHalbzeitstand",
  "heimMannschaftLiga",
  "heimOt1stand",
  "heimOt2stand",
  "heimV1stand",
  "heimV3stand",
  "heimV4stand",
  "liga",
  "spieldatum",
  "spielfeld",
  "spielfeldId",
  "spielleitungList",
  "spielnr",
  "spielortGeandert",
  "spielplanId",
  "spieltag",
  "spielzeitGeandert",
  "sr1Verein",
  "sr1VereinInformiert",
  "sr2Verein",
  "sr2VereinInformiert",
  "verzicht",
] as const satisfies readonly (keyof SdkGameDetails)[];

/** Same contract for the embedded `liga` object. */
const RECORDED_LIGA_KEYS = [
  "altersklasse",
  "ausschreibung",
  "bezirk",
  "ergViertel",
  "fibaCompetitionName",
  "fibaDss",
  "fibaLiveScores",
  "geschlecht",
  "geschlechtId",
  "kreis",
  "liganame",
  "liganr",
  "ligaId",
  "ligaKurzname",
  "localPlayerShowInfoEnabled",
  "mannschaftdataEditable",
  "mannschaftschluesselnrEditable",
  "nationalitaetSpielerstats",
  "notPublic",
  "parentLigaId",
  "scouting",
  "spielerOhneTna",
  "spielklasse",
  "spielplanEditable",
  "spieltyp",
  "sr1modus",
  "sr2modus",
  "sr3modus",
  "srAnzahlSrHm",
  "srAnzahlSrNichtHm",
  "srEigeneAnsetzungAnbieten",
  "srGebiet",
  "srKmBegrenzung",
  "srKmBegrenzungWochenende",
  "srKoppelbar",
  "srKosten",
  "srKostenKmPauschal",
  "srKurzname",
  "srKurznameOrLiganame",
  "srMindestabstandTage",
  "srModusKom",
  "srNotPublic",
  "srNotVisible",
  "srOeffentlAnbietenErlaubt",
  "srOffeneSpieleSichtbarTage",
  "srQualifikation",
  "srRueckgabefrist",
  "srSofortUebernahmeErlaubt",
  "srSpieleDirektOnline",
  "srSpieleboerseAktiv",
  "srZgSpieleAutoAnbieten",
  "statistikNotVisible",
  "tabelleNotVisible",
  "verband",
  "vorabLiga",
] as const satisfies readonly (keyof SdkGameLiga)[];

describe("SdkGameDetails matches the recorded live shape", () => {
  it("declares every key the recorded game1 payload carries", () => {
    const game1 = sample()["game1"] as Record<string, unknown>;
    expect(Object.keys(game1).sort()).toEqual([...RECORDED_GAME1_KEYS].sort());
  });

  it("declares the status flags the sync pipeline needs", () => {
    const game1 = sample()["game1"] as Record<string, unknown>;
    for (const flag of ["abgesagt", "verzicht", "ergebnisbestaetigt"] as const) {
      expect(typeof game1[flag]).toBe("boolean");
    }
  });

  it("declares every key the embedded liga object carries", () => {
    const game1 = sample()["game1"] as Record<string, unknown>;
    const liga = game1["liga"] as Record<string, unknown>;
    expect(Object.keys(liga).sort()).toEqual([...RECORDED_LIGA_KEYS].sort());
  });
});
