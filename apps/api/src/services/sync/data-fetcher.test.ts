import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SdkGetGameResponse, SdkSpielplanMatch, SdkTabelleEntry } from "@dragons/sdk";

// --- Mock setup ---

const mockLogWarn = vi.fn();
vi.mock("../../config/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: (...args: unknown[]) => mockLogWarn(...args),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

const mockSelect = vi.fn();
vi.mock("../../config/database", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  leagues: { id: "id", apiLigaId: "apiLigaId", isTracked: "isTracked" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

const mockGetSpielplan = vi.fn();
const mockGetTabelle = vi.fn();
const mockGetGameDetailsBatch = vi.fn();
const mockEnsureAuthenticated = vi.fn();
vi.mock("./sdk-client", () => ({
  sdkClient: {
    getSpielplan: (...args: unknown[]) => mockGetSpielplan(...args),
    getTabelle: (...args: unknown[]) => mockGetTabelle(...args),
    getGameDetailsBatch: (...args: unknown[]) => mockGetGameDetailsBatch(...args),
    ensureAuthenticated: (...args: unknown[]) => mockEnsureAuthenticated(...args),
  },
}));

import { fetchAllSyncData, extractRefereeAssignments } from "./data-fetcher";
import type { LeagueFetchedData } from "./data-fetcher";

beforeEach(() => {
  vi.clearAllMocks();
});

function makeMatch(overrides: Partial<SdkSpielplanMatch> = {}): SdkSpielplanMatch {
  return {
    ligaData: null,
    matchId: 1000,
    matchDay: 1,
    matchNo: 1,
    kickoffDate: "2025-01-01",
    kickoffTime: "18:00",
    homeTeam: {
      teamPermanentId: 10,
      seasonTeamId: 100,
      teamCompetitionId: 1,
      teamname: "Home",
      teamnameSmall: "H",
      clubId: 1,
      verzicht: false,
    },
    guestTeam: {
      teamPermanentId: 20,
      seasonTeamId: 200,
      teamCompetitionId: 2,
      teamname: "Guest",
      teamnameSmall: "G",
      clubId: 2,
      verzicht: false,
    },
    result: null,
    ergebnisbestaetigt: false,
    statisticType: null,
    verzicht: false,
    abgesagt: false,
    matchResult: null,
    matchInfo: null,
    matchBoxscore: null,
    playByPlay: null,
    hasPlayByPlay: null,
    ...overrides,
  };
}

function makeGameResponse(overrides: Partial<SdkGetGameResponse> = {}): SdkGetGameResponse {
  return {
    game1: {
      spielplanId: 1,
      spielnr: 1,
      spieltag: 1,
      spieldatum: Date.now(),
      spielfeldId: 50,
      heimEndstand: 0,
      gastEndstand: 0,
      heimHalbzeitstand: 0,
      gastHalbzeitstand: 0,
      heimV1stand: 0,
      gastV1stand: 0,
      heimV3stand: 0,
      gastV3stand: 0,
      heimV4stand: 0,
      gastV4stand: 0,
      heimOt1stand: -1,
      gastOt1stand: -1,
      heimOt2stand: -1,
      gastOt2stand: -1,
      spielfeld: { id: 50, bezeichnung: "Hall", strasse: "", plz: "", ort: "", kurzname: "", score: 0 },
      heimMannschaftLiga: {
        mannschaftLigaId: 1,
        mannschaft: {
          mannschaftId: 1, name: "Home", kurzname: "H", mannschaftsnr: 1,
          verein: { vereinId: 1, vereinsnummer: 1, vereinsname: "Club", inaktiv: false, verbandId: 7 },
          spielfeld: { id: 60, bezeichnung: "Home Hall", strasse: "", plz: "", ort: "", kurzname: "", score: 0 },
          spielhemdHeim: null, spielhoseHeim: null, spielhemdAuswaerts: null, spielhoseAuswaerts: null,
        },
        mannschaftName: "Home", mannschaftKurzname: "H", verzicht: false, ausserKonkurrenz: false,
        schluesselnr: 1, spielhemdHeim: null, spielhoseHeim: null, spielhemdAuswaerts: null, spielhoseAuswaerts: null,
      },
      gastMannschaftLiga: {
        mannschaftLigaId: 2,
        mannschaft: {
          mannschaftId: 2, name: "Guest", kurzname: "G", mannschaftsnr: 2,
          verein: { vereinId: 2, vereinsnummer: 2, vereinsname: "Club 2", inaktiv: false, verbandId: 7 },
          spielfeld: { id: 70, bezeichnung: "Guest Hall", strasse: "", plz: "", ort: "", kurzname: "", score: 0 },
          spielhemdHeim: null, spielhoseHeim: null, spielhemdAuswaerts: null, spielhoseAuswaerts: null,
        },
        mannschaftName: "Guest", mannschaftKurzname: "G", verzicht: false, ausserKonkurrenz: false,
        schluesselnr: 2, spielhemdHeim: null, spielhoseHeim: null, spielhemdAuswaerts: null, spielhoseAuswaerts: null,
      },
    },
    sr1: { spielleitung: null, lizenzNr: null, offenAngeboten: false },
    sr2: { spielleitung: null, lizenzNr: null, offenAngeboten: false },
    sr3: { spielleitung: null, lizenzNr: null, offenAngeboten: false },
    ...overrides,
  };
}

describe("fetchAllSyncData", () => {
  it("returns empty data when no tracked leagues in DB", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const result = await fetchAllSyncData();

    expect(result.leagueData).toHaveLength(0);
    expect(result.teams.size).toBe(0);
    expect(result.venues.size).toBe(0);
    expect(result.referees.size).toBe(0);
  });

  it("fetches data for tracked leagues", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          { id: 1, apiLigaId: 1001, name: "Test Liga" },
          { id: 2, apiLigaId: 1002, name: "Test Liga 2" },
        ]),
      }),
    });
    mockEnsureAuthenticated.mockResolvedValue(undefined);
    mockGetSpielplan.mockResolvedValue([makeMatch()]);
    mockGetTabelle.mockResolvedValue([]);
    mockGetGameDetailsBatch.mockResolvedValue(new Map([[1000, makeGameResponse()]]));

    const result = await fetchAllSyncData();

    expect(result.leagueData).toHaveLength(2);
    expect(mockEnsureAuthenticated).toHaveBeenCalled();
  });

  it("collects unique teams from match data", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: 1, apiLigaId: 1001, name: "Test Liga" }]),
      }),
    });
    mockEnsureAuthenticated.mockResolvedValue(undefined);
    mockGetSpielplan.mockResolvedValue([
      makeMatch({ homeTeam: { teamPermanentId: 10, seasonTeamId: 1, teamCompetitionId: 1, teamname: "A", teamnameSmall: "A", clubId: 1, verzicht: false } }),
      makeMatch({ matchId: 1001, homeTeam: { teamPermanentId: 10, seasonTeamId: 1, teamCompetitionId: 1, teamname: "A", teamnameSmall: "A", clubId: 1, verzicht: false } }),
    ]);
    mockGetTabelle.mockResolvedValue([]);
    mockGetGameDetailsBatch.mockResolvedValue(new Map());

    const result = await fetchAllSyncData();

    expect(result.teams.has(10)).toBe(true);
    expect(result.teams.has(20)).toBe(true);
  });

  it("collects unique venues from game details", async () => {
    const gameResp = makeGameResponse();
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: 1, apiLigaId: 1001, name: "Test Liga" }]),
      }),
    });
    mockEnsureAuthenticated.mockResolvedValue(undefined);
    mockGetSpielplan.mockResolvedValue([makeMatch()]);
    mockGetTabelle.mockResolvedValue([]);
    mockGetGameDetailsBatch.mockResolvedValue(new Map([[1000, gameResp]]));

    const result = await fetchAllSyncData();

    expect(result.venues.has(50)).toBe(true);
    expect(result.venues.has(60)).toBe(true);
    expect(result.venues.has(70)).toBe(true);
  });

  it("collects referees from game details", async () => {
    const gameResp = makeGameResponse({
      sr1: {
        spielleitung: {
          spielleitungId: 1,
          schirirolle: { schirirolleId: 1, schirirollename: "1. SR", schirirollekurzname: "1SR" },
          schiedsrichter: {
            schiedsrichterId: 100,
            vereinVO: null,
            personVO: { personId: 1, vorname: "John", nachname: "Doe", email: "", geburtsdatum: null, geschlecht: "m" },
            srgebietId: 1,
            schiristatusId: 1,
            lizenznummer: 12345,
          },
          spielleitungstatusId: 1,
          spielleitungstatus: "ok",
          tempeinteilung: false,
          zeitpunktansetzung: null,
          zeitpunktaufhebung: null,
          bemerkung: null,
          einteilungsart: 0,
          emailbenachrichtigt: false,
          nichtAngetreten: false,
        },
        lizenzNr: 12345,
        offenAngeboten: false,
      },
    });
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: 1, apiLigaId: 1001, name: "Test Liga" }]),
      }),
    });
    mockEnsureAuthenticated.mockResolvedValue(undefined);
    mockGetSpielplan.mockResolvedValue([makeMatch()]);
    mockGetTabelle.mockResolvedValue([]);
    mockGetGameDetailsBatch.mockResolvedValue(new Map([[1000, gameResp]]));

    const result = await fetchAllSyncData();

    expect(result.referees.has(100)).toBe(true);
    expect(result.refereeRoles.has(1)).toBe(true);
  });

  it("handles matches with no matchId", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: 1, apiLigaId: 1001, name: "Test Liga" }]),
      }),
    });
    mockEnsureAuthenticated.mockResolvedValue(undefined);
    mockGetSpielplan.mockResolvedValue([makeMatch({ matchId: 0 })]);
    mockGetTabelle.mockResolvedValue([]);
    mockGetGameDetailsBatch.mockResolvedValue(new Map());

    const result = await fetchAllSyncData();

    expect(result.leagueData[0]!.gameDetails.size).toBe(0);
  });

  it("skips teams with no teamPermanentId and warns for null teams", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: 1, apiLigaId: 1001, name: "Test Liga" }]),
      }),
    });
    mockEnsureAuthenticated.mockResolvedValue(undefined);
    mockGetSpielplan.mockResolvedValue([
      makeMatch({ homeTeam: null, guestTeam: null }),
    ]);
    mockGetTabelle.mockResolvedValue([]);
    mockGetGameDetailsBatch.mockResolvedValue(new Map());

    mockLogWarn.mockClear();
    const result = await fetchAllSyncData();

    expect(result.teams.size).toBe(0);
    expect(mockLogWarn).toHaveBeenCalledWith(
      expect.objectContaining({ matchId: 1000 }),
      expect.stringContaining("null/zero homeTeam"),
    );
    expect(mockLogWarn).toHaveBeenCalledWith(
      expect.objectContaining({ matchId: 1000 }),
      expect.stringContaining("null/zero guestTeam"),
    );
  });

  it("warns for zero teamPermanentId in spielplan", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: 1, apiLigaId: 1001, name: "Test Liga" }]),
      }),
    });
    mockEnsureAuthenticated.mockResolvedValue(undefined);
    mockGetSpielplan.mockResolvedValue([
      makeMatch({
        homeTeam: { teamPermanentId: 0, seasonTeamId: 0, teamCompetitionId: 0, teamname: "TBD", teamnameSmall: "", clubId: 0, verzicht: false },
        guestTeam: { teamPermanentId: 30, seasonTeamId: 300, teamCompetitionId: 3, teamname: "Valid", teamnameSmall: "V", clubId: 3, verzicht: false },
      }),
    ]);
    mockGetTabelle.mockResolvedValue([]);
    mockGetGameDetailsBatch.mockResolvedValue(new Map());

    mockLogWarn.mockClear();
    const result = await fetchAllSyncData();

    expect(result.teams.size).toBe(1);
    expect(result.teams.has(30)).toBe(true);
    expect(mockLogWarn).toHaveBeenCalledWith(
      expect.objectContaining({ matchId: 1000 }),
      expect.stringContaining("null/zero homeTeam"),
    );
  });

  it("collects teams from tabelle entries", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: 1, apiLigaId: 1001, name: "Test Liga" }]),
      }),
    });
    mockEnsureAuthenticated.mockResolvedValue(undefined);
    mockGetSpielplan.mockResolvedValue([]);
    mockGetTabelle.mockResolvedValue([
      {
        rang: 1,
        team: { teamPermanentId: 50, seasonTeamId: 500, teamCompetitionId: 5, teamname: "Tabelle Team", teamnameSmall: "TT", clubId: 5, verzicht: false },
        anzspiele: 10, anzGewinnpunkte: 20, anzVerlustpunkte: 0, s: 10, n: 0, koerbe: 800, gegenKoerbe: 600, korbdiff: 200,
      } satisfies SdkTabelleEntry,
    ]);
    mockGetGameDetailsBatch.mockResolvedValue(new Map());

    const result = await fetchAllSyncData();

    expect(result.teams.size).toBe(1);
    expect(result.teams.has(50)).toBe(true);
    expect(result.teams.get(50)!.teamname).toBe("Tabelle Team");
  });

  it("skips tabelle entries with zero teamPermanentId", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: 1, apiLigaId: 1001, name: "Test Liga" }]),
      }),
    });
    mockEnsureAuthenticated.mockResolvedValue(undefined);
    mockGetSpielplan.mockResolvedValue([]);
    mockGetTabelle.mockResolvedValue([
      {
        rang: 1,
        team: { teamPermanentId: 0, seasonTeamId: 0, teamCompetitionId: 0, teamname: "TBD", teamnameSmall: "", clubId: 0, verzicht: false },
        anzspiele: 0, anzGewinnpunkte: 0, anzVerlustpunkte: 0, s: 0, n: 0, koerbe: 0, gegenKoerbe: 0, korbdiff: 0,
      } satisfies SdkTabelleEntry,
    ]);
    mockGetGameDetailsBatch.mockResolvedValue(new Map());

    const result = await fetchAllSyncData();

    expect(result.teams.size).toBe(0);
  });

  it("skips venues without id", async () => {
    const gameResp = makeGameResponse();
    gameResp.game1.spielfeld = null;
    gameResp.game1.heimMannschaftLiga.mannschaft.spielfeld = null;
    gameResp.game1.gastMannschaftLiga.mannschaft.spielfeld = null;

    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: 1, apiLigaId: 1001, name: "Test Liga" }]),
      }),
    });
    mockEnsureAuthenticated.mockResolvedValue(undefined);
    mockGetSpielplan.mockResolvedValue([makeMatch()]);
    mockGetTabelle.mockResolvedValue([]);
    mockGetGameDetailsBatch.mockResolvedValue(new Map([[1000, gameResp]]));

    const result = await fetchAllSyncData();

    expect(result.venues.size).toBe(0);
  });

  it("skips referees with missing fields", async () => {
    const gameResp = makeGameResponse({
      sr1: { spielleitung: null, lizenzNr: null, offenAngeboten: false },
      sr2: {
        spielleitung: {
          spielleitungId: 1,
          schirirolle: null as never,
          schiedsrichter: { schiedsrichterId: 1, vereinVO: null, personVO: null as never, srgebietId: 1, schiristatusId: 1, lizenznummer: 1 },
          spielleitungstatusId: 1, spielleitungstatus: "ok", tempeinteilung: false,
          zeitpunktansetzung: null, zeitpunktaufhebung: null, bemerkung: null,
          einteilungsart: 0, emailbenachrichtigt: false, nichtAngetreten: false,
        },
        lizenzNr: null,
        offenAngeboten: false,
      },
    });

    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: 1, apiLigaId: 1001, name: "Test Liga" }]),
      }),
    });
    mockEnsureAuthenticated.mockResolvedValue(undefined);
    mockGetSpielplan.mockResolvedValue([makeMatch()]);
    mockGetTabelle.mockResolvedValue([]);
    mockGetGameDetailsBatch.mockResolvedValue(new Map([[1000, gameResp]]));

    const result = await fetchAllSyncData();

    expect(result.referees.size).toBe(0);
  });
});

describe("extractRefereeAssignments", () => {
  it("returns empty for no data", () => {
    const result = extractRefereeAssignments([]);

    expect(result).toHaveLength(0);
  });

  it("extracts assignments from sr1/sr2/sr3", () => {
    const makeSR = (schiedsrichterId: number, schirirolleId: number) => ({
      spielleitung: {
        spielleitungId: 1,
        schirirolle: { schirirolleId, schirirollename: "SR", schirirollekurzname: "SR" },
        schiedsrichter: {
          schiedsrichterId,
          vereinVO: null,
          personVO: { personId: 1, vorname: "A", nachname: "B", email: "", geburtsdatum: null, geschlecht: "m" },
          srgebietId: 1, schiristatusId: 1, lizenznummer: 1,
        },
        spielleitungstatusId: 1, spielleitungstatus: "ok", tempeinteilung: false,
        zeitpunktansetzung: null, zeitpunktaufhebung: null, bemerkung: null,
        einteilungsart: 0, emailbenachrichtigt: false, nichtAngetreten: false,
      },
      lizenzNr: 1,
      offenAngeboten: false,
    });

    const leagueData: LeagueFetchedData[] = [{
      leagueApiId: 1,
      leagueDbId: 1,
      leagueName: "Test Liga",
      spielplan: [],
      tabelle: [],
      gameDetails: new Map([[1000, {
        game1: null as never,
        sr1: makeSR(100, 1),
        sr2: makeSR(200, 2),
        sr3: { spielleitung: null, lizenzNr: null, offenAngeboten: false },
      } as SdkGetGameResponse]]),
    }];

    const assignments = extractRefereeAssignments(leagueData);

    expect(assignments).toHaveLength(2);
    expect(assignments[0]).toEqual({
      matchApiId: 1000,
      schiedsrichterId: 100,
      schirirolleId: 1,
      slotNumber: 1,
    });
  });

  it("skips slots without schiedsrichter", () => {
    const leagueData: LeagueFetchedData[] = [{
      leagueApiId: 1,
      leagueDbId: 1,
      leagueName: "Test Liga",
      spielplan: [],
      tabelle: [],
      gameDetails: new Map([[1000, {
        game1: null as never,
        sr1: { spielleitung: { spielleitungId: 1, schirirolle: { schirirolleId: 1, schirirollename: "", schirirollekurzname: "" }, schiedsrichter: null as never } as never, lizenzNr: null, offenAngeboten: false },
        sr2: { spielleitung: null, lizenzNr: null, offenAngeboten: false },
        sr3: { spielleitung: null, lizenzNr: null, offenAngeboten: false },
      } as SdkGetGameResponse]]),
    }];

    const assignments = extractRefereeAssignments(leagueData);

    expect(assignments).toHaveLength(0);
  });
});
