import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isSdkLiga, isSdkSpielplanMatch, isSdkTabelleEntry } from "./type-guards";

const SAMPLES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../samples");

function sample<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(SAMPLES, file), "utf8")) as T;
}

// ── fixtures built from the recorded live payloads ──────────────────────────

const teamRef = {
  seasonTeamId: 1,
  teamCompetitionId: 2,
  teamPermanentId: 3,
  teamname: "Dragons U18",
  teamnameSmall: "DRA",
  clubId: 4,
  verzicht: false,
};

const validMatch = {
  ligaData: null,
  matchId: 1000,
  matchDay: 1,
  matchNo: 12,
  kickoffDate: "2026-01-15",
  kickoffTime: "18:00",
  homeTeam: teamRef,
  guestTeam: { ...teamRef, teamPermanentId: 9 },
  result: "63:61",
  ergebnisbestaetigt: true,
  statisticType: null,
  verzicht: false,
  abgesagt: false,
  matchResult: null,
  matchInfo: null,
  matchBoxscore: null,
  playByPlay: null,
  hasPlayByPlay: null,
};

const validEntry = {
  rang: 1,
  team: teamRef,
  anzspiele: 10,
  anzGewinnpunkte: 16,
  anzVerlustpunkte: 4,
  s: 8,
  n: 2,
  koerbe: 700,
  gegenKoerbe: 640,
  korbdiff: 60,
};

const validLiga = {
  ligaId: 47959,
  liganr: 1,
  liganame: "Oberliga",
  seasonId: null,
  seasonName: null,
  actualMatchDay: null,
  skName: "Oberliga",
  skNameSmall: "OL",
  skEbeneId: 3,
  skEbeneName: "Landesebene",
  akName: "Herren",
  geschlechtId: 1,
  geschlecht: "maennlich",
  verbandId: 6,
  verbandName: "Hamburg",
  bezirknr: null,
  bezirkName: null,
  kreisnr: null,
  kreisname: null,
  statisticType: null,
  vorabliga: false,
  tableExists: null,
  crossTableExists: null,
};

// ── isSdkSpielplanMatch ─────────────────────────────────────────────────────

describe("isSdkSpielplanMatch", () => {
  it("accepts every match in the recorded getSpielplan sample", () => {
    const response = sample<{ matches: unknown[] }>("getSpielplan.json");
    expect(response.matches.length).toBeGreaterThan(0);
    for (const match of response.matches) {
      expect(isSdkSpielplanMatch(match), JSON.stringify(match)).toBe(true);
    }
  });

  it("accepts the hand-built fixture", () => {
    expect(isSdkSpielplanMatch(validMatch)).toBe(true);
  });

  it("accepts null home/guest teams (TBD slots)", () => {
    expect(isSdkSpielplanMatch({ ...validMatch, homeTeam: null, guestTeam: null })).toBe(true);
  });

  it("accepts a null result (not played yet)", () => {
    expect(isSdkSpielplanMatch({ ...validMatch, result: null })).toBe(true);
  });

  it("rejects the near-miss that only carries matchId", () => {
    expect(isSdkSpielplanMatch({ matchId: 1 })).toBe(false);
  });

  it("rejects a team ref that is not a team ref", () => {
    expect(isSdkSpielplanMatch({ ...validMatch, homeTeam: {} })).toBe(false);
    expect(isSdkSpielplanMatch({ ...validMatch, homeTeam: { teamPermanentId: "3" } })).toBe(false);
    expect(isSdkSpielplanMatch({ ...validMatch, guestTeam: 7 })).toBe(false);
  });

  it.each([
    "matchId",
    "matchDay",
    "matchNo",
    "kickoffDate",
    "kickoffTime",
    "homeTeam",
    "guestTeam",
    "result",
    "ergebnisbestaetigt",
    "verzicht",
    "abgesagt",
  ])("rejects a payload missing %s", (field) => {
    const partial: Record<string, unknown> = { ...validMatch };
    delete partial[field];
    expect(isSdkSpielplanMatch(partial)).toBe(false);
  });

  it("rejects wrong primitive types", () => {
    expect(isSdkSpielplanMatch({ ...validMatch, matchId: "1000" })).toBe(false);
    expect(isSdkSpielplanMatch({ ...validMatch, kickoffDate: 20260115 })).toBe(false);
    expect(isSdkSpielplanMatch({ ...validMatch, ergebnisbestaetigt: "true" })).toBe(false);
    expect(isSdkSpielplanMatch({ ...validMatch, result: 6361 })).toBe(false);
    expect(isSdkSpielplanMatch({ ...validMatch, statisticType: "0" })).toBe(false);
    expect(isSdkSpielplanMatch({ ...validMatch, hasPlayByPlay: "no" })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isSdkSpielplanMatch(null)).toBe(false);
    expect(isSdkSpielplanMatch(undefined)).toBe(false);
    expect(isSdkSpielplanMatch(1000)).toBe(false);
    expect(isSdkSpielplanMatch("match")).toBe(false);
    expect(isSdkSpielplanMatch([validMatch])).toBe(false);
  });
});

// ── isSdkTabelleEntry ───────────────────────────────────────────────────────

describe("isSdkTabelleEntry", () => {
  it("accepts every entry in the recorded getTabelle sample", () => {
    const response = sample<{ tabelle: { entries: unknown[] } }>("getTabelle.json");
    expect(response.tabelle.entries.length).toBeGreaterThan(0);
    for (const entry of response.tabelle.entries) {
      expect(isSdkTabelleEntry(entry), JSON.stringify(entry)).toBe(true);
    }
  });

  it("accepts the hand-built fixture", () => {
    expect(isSdkTabelleEntry(validEntry)).toBe(true);
  });

  it("rejects the near-miss with a null team", () => {
    expect(isSdkTabelleEntry({ rang: 1, team: null })).toBe(false);
    expect(isSdkTabelleEntry({ ...validEntry, team: null })).toBe(false);
  });

  it.each([
    "rang",
    "team",
    "anzspiele",
    "anzGewinnpunkte",
    "anzVerlustpunkte",
    "s",
    "n",
    "koerbe",
    "gegenKoerbe",
    "korbdiff",
  ])("rejects an entry missing %s", (field) => {
    const partial: Record<string, unknown> = { ...validEntry };
    delete partial[field];
    expect(isSdkTabelleEntry(partial)).toBe(false);
  });

  it("rejects wrong primitive types", () => {
    expect(isSdkTabelleEntry({ ...validEntry, rang: "1" })).toBe(false);
    expect(isSdkTabelleEntry({ ...validEntry, korbdiff: null })).toBe(false);
    expect(isSdkTabelleEntry({ ...validEntry, team: { teamname: "Dragons" } })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isSdkTabelleEntry(null)).toBe(false);
    expect(isSdkTabelleEntry([validEntry])).toBe(false);
    expect(isSdkTabelleEntry("1")).toBe(false);
  });
});

// ── isSdkLiga ───────────────────────────────────────────────────────────────

describe("isSdkLiga", () => {
  it("accepts every liga in the recorded getLigaList sample", () => {
    const response = sample<{ ligen: unknown[] }>("getLigaList.json");
    expect(response.ligen.length).toBeGreaterThan(0);
    for (const liga of response.ligen) {
      expect(isSdkLiga(liga), JSON.stringify(liga)).toBe(true);
    }
  });

  it("accepts the hand-built fixture", () => {
    expect(isSdkLiga(validLiga)).toBe(true);
  });

  it("rejects the near-miss that only carries the two ids", () => {
    expect(isSdkLiga({ ligaId: 1, liganr: 2 })).toBe(false);
  });

  it.each([
    "ligaId",
    "liganr",
    "liganame",
    "seasonId",
    "seasonName",
    "actualMatchDay",
    "skName",
    "skNameSmall",
    "skEbeneId",
    "skEbeneName",
    "akName",
    "geschlechtId",
    "geschlecht",
    "verbandId",
    "verbandName",
    "bezirknr",
    "bezirkName",
    "kreisnr",
    "kreisname",
    "statisticType",
    "vorabliga",
    "tableExists",
    "crossTableExists",
  ])("rejects a liga missing %s", (field) => {
    const partial: Record<string, unknown> = { ...validLiga };
    delete partial[field];
    expect(isSdkLiga(partial)).toBe(false);
  });

  it("rejects wrong primitive types", () => {
    expect(isSdkLiga({ ...validLiga, ligaId: "47959" })).toBe(false);
    expect(isSdkLiga({ ...validLiga, liganame: null })).toBe(false);
    expect(isSdkLiga({ ...validLiga, vorabliga: "false" })).toBe(false);
    expect(isSdkLiga({ ...validLiga, tableExists: 1 })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isSdkLiga(null)).toBe(false);
    expect(isSdkLiga([validLiga])).toBe(false);
    expect(isSdkLiga(47959)).toBe(false);
  });
});
