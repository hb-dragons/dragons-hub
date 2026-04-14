import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SdkOffeneSpielResult, SdkSpielleitung } from "@dragons/sdk";

// --- Mock setup ---

vi.mock("../../config/logger", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
vi.mock("../../config/database", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  refereeGames: {
    apiMatchId: "apiMatchId",
    id: "id",
    dataHash: "dataHash",
  },
  matches: {
    apiMatchId: "apiMatchId",
    id: "id",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
}));

const mockPublishDomainEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("../events/event-publisher", () => ({
  publishDomainEvent: (...args: unknown[]) => mockPublishDomainEvent(...args),
}));

const mockScheduleReminderJobs = vi.fn().mockResolvedValue(undefined);
const mockCancelReminderJobs = vi.fn().mockResolvedValue(undefined);
vi.mock("../referee/referee-reminders.service", () => ({
  scheduleReminderJobs: (...args: unknown[]) => mockScheduleReminderJobs(...args),
  cancelReminderJobs: (...args: unknown[]) => mockCancelReminderJobs(...args),
}));

vi.mock("@dragons/shared", () => ({
  EVENT_TYPES: {
    REFEREE_SLOTS_NEEDED: "referee.slots.needed",
  },
}));

const mockFetchOffeneSpiele = vi.fn();
vi.mock("./referee-sdk-client", () => ({
  createRefereeSdkClient: () => ({
    fetchOffeneSpiele: () => mockFetchOffeneSpiele(),
  }),
}));

import {
  deriveSrStatus,
  computeRefereeGameHash,
  mapApiResultToRow,
  syncRefereeGames,
} from "./referee-games.sync";

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Helpers ---

function makeSr(overrides: Partial<SdkSpielleitung> = {}): SdkSpielleitung {
  return {
    spielleitungId: 1,
    schirirolle: {
      schirirolleId: 1,
      schirirollename: "Schiedsrichter 1",
      schirirollekurzname: "SR1",
    },
    schiedsrichter: {
      schiedsrichterId: 42,
      vereinVO: null,
      personVO: {
        personId: 100,
        nachname: "Müller",
        vorname: "Hans",
        email: "hans@example.com",
        geburtsdatum: null,
        geschlecht: "M",
      },
      srgebietId: 1,
      schiristatusId: 1,
      lizenznummer: 12345,
    },
    spielleitungstatusId: 1,
    spielleitungstatus: "ANGESETZT",
    tempeinteilung: false,
    zeitpunktansetzung: null,
    zeitpunktaufhebung: null,
    bemerkung: null,
    einteilungsart: 1,
    emailbenachrichtigt: false,
    nichtAngetreten: false,
    ...overrides,
  };
}

function makeApiResult(overrides: Partial<SdkOffeneSpielResult> = {}): SdkOffeneSpielResult {
  return {
    sp: {
      spielplanId: 1001,
      spielnr: 42,
      spieltag: 1,
      spieldatum: 1777118400000, // 2026-04-25T12:00:00Z = 14:00 CEST
      spielfeldId: 5,
      liga: {
        ligaId: 10,
        liganr: 1,
        liganame: "Kreisliga Nord",
        ligaKurzname: "KLN",
        srKurzname: "SR-KLN",
        sr1modus: null,
        sr2modus: null,
      },
      heimMannschaftLiga: {
        mannschaftLigaId: 100,
        mannschaft: {
          mannschaftId: 200,
          name: "Dragons",
          kurzname: "DRG",
          mannschaftsnr: 1,
          verein: {
            vereinId: 300,
            vereinsnummer: 1001,
            vereinsname: "SC Dragons",
            inaktiv: false,
            verbandId: 1,
          },
          spielfeld: null,
          spielhemdHeim: null,
          spielhoseHeim: null,
          spielhemdAuswaerts: null,
          spielhoseAuswaerts: null,
        },
        mannschaftName: "Dragons 1",
        mannschaftKurzname: "DRG1",
        verzicht: false,
        ausserKonkurrenz: false,
        schluesselnr: 1,
        spielhemdHeim: null,
        spielhoseHeim: null,
        spielhemdAuswaerts: null,
        spielhoseAuswaerts: null,
      },
      gastMannschaftLiga: {
        mannschaftLigaId: 101,
        mannschaft: {
          mannschaftId: 201,
          name: "Titans",
          kurzname: "TIT",
          mannschaftsnr: 2,
          verein: {
            vereinId: 301,
            vereinsnummer: 1002,
            vereinsname: "SV Titans",
            inaktiv: false,
            verbandId: 1,
          },
          spielfeld: null,
          spielhemdHeim: null,
          spielhoseHeim: null,
          spielhemdAuswaerts: null,
          spielhoseAuswaerts: null,
        },
        mannschaftName: "Titans 1",
        mannschaftKurzname: "TIT1",
        verzicht: false,
        ausserKonkurrenz: false,
        schluesselnr: 2,
        spielhemdHeim: null,
        spielhoseHeim: null,
        spielhemdAuswaerts: null,
        spielhoseAuswaerts: null,
      },
      spielfeld: {
        id: 5,
        bezeichnung: "Sporthalle West",
        strasse: "Hauptstr. 1",
        plz: "12345",
        ort: "Berlin",
        kurzname: "SPW",
        score: 0,
      },
      sr1Verein: null,
      sr2Verein: null,
      sr1VereinInformiert: null,
      sr2VereinInformiert: null,
      ergebnisbestaetigt: false,
      verzicht: false,
      abgesagt: false,
      spielortGeandert: false,
      spielzeitGeandert: false,
    },
    sr1: null,
    sr2: null,
    sr1MeinVerein: true,
    sr2MeinVerein: false,
    sr1OffenAngeboten: false,
    sr2OffenAngeboten: true,
    ...overrides,
  };
}

// --- Tests ---

describe("deriveSrStatus", () => {
  it("returns 'assigned' when sr is not null", () => {
    expect(deriveSrStatus(makeSr(), false)).toBe("assigned");
  });

  it("returns 'offered' when sr is null and offenAngeboten is true", () => {
    expect(deriveSrStatus(null, true)).toBe("offered");
  });

  it("returns 'open' when sr is null and offenAngeboten is false", () => {
    expect(deriveSrStatus(null, false)).toBe("open");
  });
});

describe("computeRefereeGameHash", () => {
  it("returns consistent hash for same input", () => {
    const row = {
      sr1Status: "assigned" as const,
      sr2Status: "open" as const,
      sr1Name: "Hans Müller",
      sr2Name: null,
      kickoffDate: "2026-04-25",
      kickoffTime: "14:00",
      isCancelled: false,
      isForfeited: false,
    };
    const hash1 = computeRefereeGameHash(row);
    const hash2 = computeRefereeGameHash(row);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex
  });

  it("returns different hash when sr status changes", () => {
    const row1 = {
      sr1Status: "open" as const,
      sr2Status: "open" as const,
      sr1Name: null,
      sr2Name: null,
      kickoffDate: "2026-04-25",
      kickoffTime: "14:00",
      isCancelled: false,
      isForfeited: false,
    };
    const row2 = { ...row1, sr1Status: "assigned" as const, sr1Name: "Hans Müller" };
    expect(computeRefereeGameHash(row1)).not.toBe(computeRefereeGameHash(row2));
  });
});

describe("mapApiResultToRow", () => {
  it("maps all fields correctly from API result", () => {
    const sr1 = makeSr();
    const result = makeApiResult({ sr1 });
    const row = mapApiResultToRow(result);

    expect(row.apiMatchId).toBe(1001);
    expect(row.matchNo).toBe(42);
    expect(row.homeTeamName).toBe("Dragons 1");
    expect(row.guestTeamName).toBe("Titans 1");
    expect(row.leagueName).toBe("Kreisliga Nord");
    expect(row.leagueShort).toBe("SR-KLN");
    expect(row.venueName).toBe("Sporthalle West");
    expect(row.venueCity).toBe("Berlin");
    expect(row.sr1OurClub).toBe(true);
    expect(row.sr2OurClub).toBe(false);
    expect(row.sr1Name).toBe("Hans Müller");
    expect(row.sr2Name).toBeNull();
    expect(row.sr1RefereeApiId).toBe(42);
    expect(row.sr2RefereeApiId).toBeNull();
    expect(row.sr1Status).toBe("assigned");
    expect(row.sr2Status).toBe("offered");
    expect(row.isCancelled).toBe(false);
    expect(row.isForfeited).toBe(false);
    expect(row.homeClubId).toBe(300);
    expect(row.guestClubId).toBe(301);
  });

  it("converts epoch ms to Europe/Berlin date and time", () => {
    // 1777118400000 = 2026-04-25T12:00:00Z = 2026-04-25 14:00 CEST (UTC+2)
    const result = makeApiResult();
    const row = mapApiResultToRow(result);
    expect(row.kickoffDate).toBe("2026-04-25");
    expect(row.kickoffTime).toBe("14:00");
  });

  it("handles null spielfeld gracefully", () => {
    const result = makeApiResult();
    result.sp.spielfeld = null;
    const row = mapApiResultToRow(result);
    expect(row.venueName).toBeNull();
    expect(row.venueCity).toBeNull();
  });

  it("extracts referee name when assigned", () => {
    const sr2 = makeSr({
      schiedsrichter: {
        schiedsrichterId: 99,
        vereinVO: null,
        personVO: {
          personId: 200,
          nachname: "Schmidt",
          vorname: "Eva",
          email: "eva@example.com",
          geburtsdatum: null,
          geschlecht: "W",
        },
        srgebietId: 1,
        schiristatusId: 1,
        lizenznummer: 99999,
      },
    });
    const result = makeApiResult({ sr2 });
    const row = mapApiResultToRow(result);
    expect(row.sr2Name).toBe("Eva Schmidt");
    expect(row.sr2RefereeApiId).toBe(99);
    expect(row.sr2Status).toBe("assigned");
  });
});

describe("syncRefereeGames", () => {
  it("returns zeros when API returns empty results", async () => {
    mockFetchOffeneSpiele.mockResolvedValue({ total: 0, results: [] });
    const counts = await syncRefereeGames();
    expect(counts).toEqual({ created: 0, updated: 0, unchanged: 0 });
  });

  it("inserts new game and emits event when open our-club slot exists", async () => {
    // sr1 is open and our club
    const result = makeApiResult({
      sr1: null,
      sr1MeinVerein: true,
      sr1OffenAngeboten: false,
    });
    mockFetchOffeneSpiele.mockResolvedValue({ total: 1, results: [result] });

    // No existing row
    const mockFrom = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
    });
    mockSelect.mockReturnValue({ from: mockFrom });

    // Insert returns the new row
    const mockValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 1, apiMatchId: 1001 }]),
    });
    mockInsert.mockReturnValue({ values: mockValues });

    const counts = await syncRefereeGames();

    expect(counts.created).toBe(1);
    expect(mockInsert).toHaveBeenCalled();
    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "referee.slots.needed",
      }),
    );
    expect(mockScheduleReminderJobs).toHaveBeenCalledWith(
      1001, 1, "2026-04-25", "14:00",
    );
  });

  it("skips unchanged games", async () => {
    const sr1 = makeSr();
    const result = makeApiResult({ sr1 });
    mockFetchOffeneSpiele.mockResolvedValue({ total: 1, results: [result] });

    // We need to compute the actual hash the implementation will compute
    // Existing row has matching hash — mock the select to return it
    const mockFrom = vi.fn();
    const mockWhere = vi.fn();
    const mockLimit = vi.fn();

    // First select: referee_games by apiMatchId - return existing with matching hash
    // Second select: matches by apiMatchId - return match
    let selectCallCount = 0;
    mockLimit.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        // Return existing referee_games row — we need to calculate the actual hash
        // The row from mapApiResultToRow with sr1 assigned will have specific values
        // We'll use a placeholder and verify it's compared
        return Promise.resolve([{
          id: 1,
          apiMatchId: 1001,
          dataHash: "will-be-set-below",
          sr1Status: "assigned",
          sr2Status: "offered",
        }]);
      }
      // matches lookup
      return Promise.resolve([{ id: 50 }]);
    });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    // To make it "unchanged", we need the hash to match.
    // Let's compute it by calling computeRefereeGameHash with the mapped row values.
    // Instead, let's use the real function to get the hash.
    const mapped = mapApiResultToRow(result);
    const hash = computeRefereeGameHash(mapped);

    // Reset and re-setup with correct hash
    selectCallCount = 0;
    mockLimit.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return Promise.resolve([{
          id: 1,
          apiMatchId: 1001,
          dataHash: hash,
          sr1Status: "assigned",
          sr2Status: "offered",
        }]);
      }
      return Promise.resolve([{ id: 50 }]);
    });

    const counts = await syncRefereeGames();

    expect(counts.unchanged).toBe(1);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("updates game and cancels reminders when both slots filled", async () => {
    const sr1 = makeSr();
    const sr2 = makeSr({
      schiedsrichter: {
        schiedsrichterId: 99,
        vereinVO: null,
        personVO: {
          personId: 200,
          nachname: "Schmidt",
          vorname: "Eva",
          email: "eva@example.com",
          geburtsdatum: null,
          geschlecht: "W",
        },
        srgebietId: 1,
        schiristatusId: 1,
        lizenznummer: 99999,
      },
    });
    const result = makeApiResult({ sr1, sr2 });
    mockFetchOffeneSpiele.mockResolvedValue({ total: 1, results: [result] });

    // Existing row with different hash (previously had open slots)
    const mockFrom = vi.fn();
    const mockWhere = vi.fn();
    const mockLimit = vi.fn();

    let selectCallCount = 0;
    mockLimit.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return Promise.resolve([{
          id: 1,
          apiMatchId: 1001,
          dataHash: "old-hash",
          sr1Status: "open",
          sr2Status: "open",
          sr1OurClub: true,
          sr2OurClub: false,
        }]);
      }
      return Promise.resolve([{ id: 50 }]);
    });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    // Update returns
    const mockSet = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    mockUpdate.mockReturnValue({ set: mockSet });

    const counts = await syncRefereeGames();

    expect(counts.updated).toBe(1);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockCancelReminderJobs).toHaveBeenCalledWith(1001);
  });

  it("continues processing when a single game throws", async () => {
    const result1 = makeApiResult();
    const result2 = makeApiResult();
    result2.sp.spielplanId = 2002;
    result2.sp.spielnr = 99;
    mockFetchOffeneSpiele.mockResolvedValue({ total: 2, results: [result1, result2] });

    // First game: select throws
    // Second game: works fine
    let selectCallCount = 0;
    const mockFrom = vi.fn();
    const mockWhere = vi.fn();
    const mockLimit = vi.fn();

    mockLimit.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return Promise.reject(new Error("DB connection lost"));
      }
      if (selectCallCount === 2) {
        return Promise.resolve([]); // no existing referee_games row
      }
      return Promise.resolve([]); // no matches row
    });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const mockValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 2, apiMatchId: 2002 }]),
    });
    mockInsert.mockReturnValue({ values: mockValues });

    const counts = await syncRefereeGames();

    // First failed, second created
    expect(counts.created).toBe(1);
  });

  it("updates game and reschedules reminders when kickoff changes", async () => {
    const result = makeApiResult({
      sr1: null,
      sr1MeinVerein: true,
      sr1OffenAngeboten: false,
    });
    mockFetchOffeneSpiele.mockResolvedValue({ total: 1, results: [result] });

    const mockFrom = vi.fn();
    const mockWhere = vi.fn();
    const mockLimit = vi.fn();

    let selectCallCount = 0;
    mockLimit.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return Promise.resolve([{
          id: 1,
          apiMatchId: 1001,
          dataHash: "old-hash",
          sr1Status: "open",
          sr2Status: "offered",
          sr1OurClub: true,
          sr2OurClub: false,
          kickoffDate: "2026-04-20",
          kickoffTime: "14:00",
          isCancelled: false,
          isForfeited: false,
        }]);
      }
      return Promise.resolve([{ id: 50 }]);
    });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const mockSet = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    mockUpdate.mockReturnValue({ set: mockSet });

    const counts = await syncRefereeGames();

    expect(counts.updated).toBe(1);
    // Kickoff changed: cancel old reminders, schedule new ones
    expect(mockCancelReminderJobs).toHaveBeenCalledWith(1001);
    expect(mockScheduleReminderJobs).toHaveBeenCalledWith(1001, 1, "2026-04-25", "14:00");
  });

  it("emits event when a slot opens on update", async () => {
    // sr1 was assigned, now it's open — slot opened
    const result = makeApiResult({
      sr1: null,
      sr1MeinVerein: true,
      sr1OffenAngeboten: false,
    });
    mockFetchOffeneSpiele.mockResolvedValue({ total: 1, results: [result] });

    const mockFrom = vi.fn();
    const mockWhere = vi.fn();
    const mockLimit = vi.fn();

    let selectCallCount = 0;
    mockLimit.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return Promise.resolve([{
          id: 1,
          apiMatchId: 1001,
          dataHash: "old-hash",
          sr1Status: "assigned",
          sr2Status: "offered",
          sr1OurClub: true,
          sr2OurClub: false,
          kickoffDate: "2026-04-25",
          kickoffTime: "14:00",
          isCancelled: false,
          isForfeited: false,
        }]);
      }
      return Promise.resolve([{ id: 50 }]);
    });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const mockSet = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    mockUpdate.mockReturnValue({ set: mockSet });

    const counts = await syncRefereeGames();

    expect(counts.updated).toBe(1);
    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "referee.slots.needed",
      }),
    );
  });

  it("cancels reminders when game is cancelled on update", async () => {
    const result = makeApiResult();
    result.sp.abgesagt = true;
    mockFetchOffeneSpiele.mockResolvedValue({ total: 1, results: [result] });

    const mockFrom = vi.fn();
    const mockWhere = vi.fn();
    const mockLimit = vi.fn();

    let selectCallCount = 0;
    mockLimit.mockImplementation(() => {
      selectCallCount++;
      if (selectCallCount === 1) {
        return Promise.resolve([{
          id: 1,
          apiMatchId: 1001,
          dataHash: "old-hash",
          sr1Status: "open",
          sr2Status: "offered",
          sr1OurClub: true,
          sr2OurClub: false,
          kickoffDate: "2026-04-23",
          kickoffTime: "12:00",
          isCancelled: false,
          isForfeited: false,
        }]);
      }
      return Promise.resolve([{ id: 50 }]);
    });
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const mockSet = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    mockUpdate.mockReturnValue({ set: mockSet });

    const counts = await syncRefereeGames();

    expect(counts.updated).toBe(1);
    expect(mockCancelReminderJobs).toHaveBeenCalledWith(1001);
  });

  it("should log entries when SyncLogger is provided", async () => {
    const mockLogger = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    // Use one result that will be inserted (new game)
    const result = makeApiResult({
      sr1: null,
      sr1MeinVerein: true,
      sr1OffenAngeboten: false,
    });
    mockFetchOffeneSpiele.mockResolvedValue({ total: 1, results: [result] });

    // No existing row
    const mockFrom = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
    });
    mockSelect.mockReturnValue({ from: mockFrom });

    const mockValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: 1, apiMatchId: 1001 }]),
    });
    mockInsert.mockReturnValue({ values: mockValues });

    await syncRefereeGames(mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "refereeGame" }),
    );
  });
});
