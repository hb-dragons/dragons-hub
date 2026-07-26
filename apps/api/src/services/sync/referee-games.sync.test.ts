import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import type { SdkOffeneSpielResult, SdkSpielleitung } from "@dragons/sdk";

// Real Postgres (pglite) with real migrations, the real drizzle operators and the
// real `EVENT_TYPES` from @dragons/shared.
//
// The previous mocked-ORM version stubbed `eq`/`and`/`gte`/`isNull`/`inArray` to
// identity functions and hand-choreographed `select()` return values by call
// index, so nothing this file's queries express was executed — the clubId→team
// preference, the `inArray(refereeGames.apiMatchId, ...)` batch load and the
// `where(eq(refereeGames.id, existing.id))` update target were all inert. It also
// mocked `@dragons/shared` down to a single EVENT_TYPES key, so
// `EVENT_TYPES.MATCH_REMOVED` and `EVENT_TYPES.SYNC_COMPLETED` resolved to
// `undefined` inside the code under test and no assertion noticed.
//
// `removeWithdrawnRefereeGames` has its own pglite suite in
// referee-games.removal.integration.test.ts; here the feed always contains every
// synced game, so the removal pass is a no-op.
const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      { get: (_t, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop] },
    ),
}));

vi.mock("../../config/logger", () => ({
  logger: {
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  },
}));

const mockPublishDomainEvent = vi.fn();
vi.mock("../events/event-publisher", () => ({
  publishDomainEvent: (...args: unknown[]) => mockPublishDomainEvent(...args),
}));

const mockScheduleReminderJobs = vi.fn();
const mockCancelReminderJobs = vi.fn();
vi.mock("../referee/referee-reminders.service", () => ({
  scheduleReminderJobs: (...args: unknown[]) => mockScheduleReminderJobs(...args),
  cancelReminderJobs: (...args: unknown[]) => mockCancelReminderJobs(...args),
}));

const mockFetchOffeneSpiele = vi.fn();
vi.mock("./referee-sdk-client", () => ({
  createRefereeSdkClient: () => ({
    fetchOffeneSpiele: () => mockFetchOffeneSpiele(),
  }),
}));

const mockGetClubConfig = vi.fn();
vi.mock("../admin/settings.service", () => ({
  getClubConfig: () => mockGetClubConfig(),
}));

import {
  deriveSrStatus,
  computeRefereeGameHash,
  mapApiResultToRow,
  syncRefereeGames,
} from "./referee-games.sync";
import { refereeGames, leagues, teams, matches } from "@dragons/db/schema";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  dbHolder.ref = ctx.db;
  vi.clearAllMocks();
  mockPublishDomainEvent.mockResolvedValue(undefined);
  mockScheduleReminderJobs.mockResolvedValue(undefined);
  mockCancelReminderJobs.mockResolvedValue(undefined);
  mockGetClubConfig.mockResolvedValue({ clubId: 300, clubName: "SC Dragons" });
});

afterAll(async () => {
  await closeTestDb(ctx);
});

// --- SDK fixtures ---

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


// --- DB helpers ---

/** Insert teams with a given clubId, returning their generated ids in order. */
async function seedTeams(rows: Array<{ clubId: number; isOwnClub?: boolean; name?: string }>) {
  const inserted = await ctx.db
    .insert(teams)
    .values(
      rows.map((r, i) => ({
        apiTeamPermanentId: 9000 + i,
        seasonTeamId: 9000 + i,
        teamCompetitionId: 1,
        name: r.name ?? `Team ${i}`,
        clubId: r.clubId,
        isOwnClub: r.isOwnClub ?? false,
      })),
    )
    .returning({ id: teams.id });
  return inserted.map((r) => r.id);
}

async function seedLeague(apiLigaId: number, ownClubRefs: boolean) {
  await ctx.db.insert(leagues).values({
    apiLigaId,
    ligaNr: apiLigaId,
    name: "Kreisliga Nord",
    seasonId: 2026,
    seasonName: "2025/26",
    ownClubRefs,
  });
}

async function gameRows() {
  return ctx.db.select().from(refereeGames).orderBy(refereeGames.apiMatchId);
}

async function gameRow(apiMatchId = 1001) {
  const [row] = await ctx.db
    .select()
    .from(refereeGames)
    .where(eq(refereeGames.apiMatchId, apiMatchId));
  if (!row) throw new Error(`referee game ${apiMatchId} not found`);
  return row;
}

/** Feed helper: total always matches the payload so the removal page gate passes. */
function feed(...results: SdkOffeneSpielResult[]) {
  return { total: results.length, results };
}

/** Swap getDb() for a proxy overriding one method and delegating the rest. */
function overrideDbMethod(name: string, impl: unknown) {
  const real = ctx.db as unknown as Record<string | symbol, unknown>;
  dbHolder.ref = new Proxy({}, { get: (_t, prop) => (prop === name ? impl : real[prop]) });
}

describe("syncRefereeGames", () => {
  it("returns zeros when the API returns no results", async () => {
    mockFetchOffeneSpiele.mockResolvedValue(feed());

    const counts = await syncRefereeGames();

    expect(counts).toEqual({ created: 0, updated: 0, unchanged: 0, removed: 0 });
    expect(await gameRows()).toEqual([]);
  });

  it("inserts a new game with every mapped column and emits the open-slot event", async () => {
    const result = makeApiResult({ sr1: null, sr1MeinVerein: true, sr1OffenAngeboten: false });
    mockFetchOffeneSpiele.mockResolvedValue(feed(result));

    const counts = await syncRefereeGames();

    expect(counts.created).toBe(1);

    const row = await gameRow();
    expect(row.matchNo).toBe(42);
    expect(row.leagueApiId).toBe(10);
    expect(row.kickoffDate).toBe("2026-04-25");
    expect(row.kickoffTime).toBe("14:00:00");
    expect(row.homeTeamName).toBe("Dragons 1");
    expect(row.guestTeamName).toBe("Titans 1");
    expect(row.leagueName).toBe("Kreisliga Nord");
    expect(row.leagueShort).toBe("SR-KLN");
    expect(row.venueName).toBe("Sporthalle West");
    expect(row.venueCity).toBe("Berlin");
    expect(row.sr1OurClub).toBe(true);
    expect(row.sr2OurClub).toBe(false);
    expect(row.sr1Status).toBe("open");
    expect(row.sr2Status).toBe("offered");
    expect(row.dataHash).toBe(computeRefereeGameHash(mapApiResultToRow(result)));
    expect(row.lastSyncedAt).not.toBeNull();
    expect(row.removedAt).toBeNull();

    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "referee.slots.needed",
        entityId: row.id,
        entityName: "Dragons 1 vs Titans 1",
        payload: expect.objectContaining({
          matchNo: 42,
          sr1Open: true,
          sr2Open: false,
          deepLink: "/referee/games?apiMatchId=1001",
        }),
      }),
    );
    expect(mockScheduleReminderJobs).toHaveBeenCalledWith(1001, row.id, "2026-04-25", "14:00");
  });

  it("links the referee game to an existing match row", async () => {
    await ctx.db.insert(teams).values([
      { apiTeamPermanentId: 1, seasonTeamId: 1, teamCompetitionId: 1, name: "H", clubId: 300 },
      { apiTeamPermanentId: 2, seasonTeamId: 2, teamCompetitionId: 2, name: "G", clubId: 301 },
    ]);
    const [match] = await ctx.db
      .insert(matches)
      .values({
        apiMatchId: 1001,
        matchNo: 42,
        matchDay: 1,
        kickoffDate: "2026-04-25",
        kickoffTime: "14:00:00",
        homeTeamApiId: 1,
        guestTeamApiId: 2,
      })
      .returning();
    mockFetchOffeneSpiele.mockResolvedValue(
      feed(makeApiResult({ sr1: null, sr1MeinVerein: true, sr1OffenAngeboten: false })),
    );

    await syncRefereeGames();

    expect((await gameRow()).matchId).toBe(match!.id);
    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          matchId: match!.id,
          deepLink: `/referee/matches?take=${match!.id}`,
        }),
      }),
    );
  });

  it("does not emit or schedule for a game with no open our-club slot", async () => {
    // sr1 assigned, sr2 offered but not our club → nothing open for us.
    mockFetchOffeneSpiele.mockResolvedValue(feed(makeApiResult({ sr1: makeSr() })));

    const counts = await syncRefereeGames();

    expect(counts.created).toBe(1);
    expect(mockPublishDomainEvent).not.toHaveBeenCalled();
    expect(mockScheduleReminderJobs).not.toHaveBeenCalled();
  });

  it("does not emit for a cancelled game even when a slot is open", async () => {
    const result = makeApiResult({ sr1: null, sr1MeinVerein: true, sr1OffenAngeboten: false });
    result.sp.abgesagt = true;
    mockFetchOffeneSpiele.mockResolvedValue(feed(result));

    await syncRefereeGames();

    expect((await gameRow()).isCancelled).toBe(true);
    expect(mockPublishDomainEvent).not.toHaveBeenCalled();
  });

  it("upserts on apiMatchId conflict so a concurrent run can't drop the insert (#69)", async () => {
    const result = makeApiResult({ sr1: null, sr1MeinVerein: true, sr1OffenAngeboten: false });
    mockFetchOffeneSpiele.mockResolvedValue(feed(result));
    // A row already exists for this apiMatchId with stale data, but it is hidden
    // from the batch pre-load (as it would be for a run that raced us), so the
    // sync takes the INSERT branch and must resolve the conflict by updating.
    await ctx.db.insert(refereeGames).values({
      apiMatchId: 1001,
      matchNo: 1,
      kickoffDate: "2020-01-01",
      kickoffTime: "09:00:00",
      homeTeamName: "stale home",
      guestTeamName: "stale guest",
      sr1OurClub: false,
      sr2OurClub: false,
      dataHash: "stale",
    });
    const real = ctx.db as unknown as Record<string | symbol, unknown>;
    let selectCall = 0;
    dbHolder.ref = new Proxy(
      {},
      {
        get: (_t, prop) =>
          prop === "select"
            ? (...args: unknown[]) => {
                selectCall++;
                // 3rd select is the refereeGames batch pre-load.
                if (selectCall === 3) {
                  return { from: () => ({ where: async () => [] }) };
                }
                return (real.select as (...a: unknown[]) => unknown)(...args);
              }
            : real[prop],
      },
    );

    const counts = await syncRefereeGames();

    expect(counts.created).toBe(1);
    const rows = await gameRows();
    expect(rows).toHaveLength(1); // no duplicate row
    expect(rows[0]!.matchNo).toBe(42);
    expect(rows[0]!.homeTeamName).toBe("Dragons 1");
    expect(rows[0]!.kickoffDate).toBe("2026-04-25");
    expect(rows[0]!.dataHash).toBe(computeRefereeGameHash(mapApiResultToRow(result)));
  });

  it("skips an unchanged game on re-sync", async () => {
    mockFetchOffeneSpiele.mockResolvedValue(feed(makeApiResult({ sr1: makeSr() })));
    await syncRefereeGames();
    const before = await gameRow();
    vi.clearAllMocks();
    mockFetchOffeneSpiele.mockResolvedValue(feed(makeApiResult({ sr1: makeSr() })));

    const counts = await syncRefereeGames();

    expect(counts).toMatchObject({ created: 0, updated: 0, unchanged: 1 });
    const after = await gameRow();
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(after.lastSyncedAt!.getTime()).toBe(before.lastSyncedAt!.getTime());
  });

  it("updates the row and cancels reminders when both slots fill", async () => {
    mockFetchOffeneSpiele.mockResolvedValue(
      feed(makeApiResult({ sr1: null, sr1MeinVerein: true, sr1OffenAngeboten: false })),
    );
    await syncRefereeGames();
    const before = await gameRow();
    vi.clearAllMocks();

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
    mockFetchOffeneSpiele.mockResolvedValue(feed(makeApiResult({ sr1: makeSr(), sr2 })));

    const counts = await syncRefereeGames();

    expect(counts.updated).toBe(1);
    const after = await gameRow();
    expect(after.id).toBe(before.id); // updated in place
    expect(after.sr1Status).toBe("assigned");
    expect(after.sr2Status).toBe("assigned");
    expect(after.sr1Name).toBe("Hans Müller");
    expect(after.sr2Name).toBe("Eva Schmidt");
    expect(after.dataHash).not.toBe(before.dataHash);
    expect(mockCancelReminderJobs).toHaveBeenCalledWith(1001);
  });

  it("reschedules reminders when the kickoff moves", async () => {
    const early = makeApiResult({ sr1: null, sr1MeinVerein: true, sr1OffenAngeboten: false });
    early.sp.spieldatum = 1776686400000; // 2026-04-20 14:00 CEST
    mockFetchOffeneSpiele.mockResolvedValue(feed(early));
    await syncRefereeGames();
    expect((await gameRow()).kickoffDate).toBe("2026-04-20");
    vi.clearAllMocks();

    mockFetchOffeneSpiele.mockResolvedValue(
      feed(makeApiResult({ sr1: null, sr1MeinVerein: true, sr1OffenAngeboten: false })),
    );
    const counts = await syncRefereeGames();

    expect(counts.updated).toBe(1);
    const row = await gameRow();
    expect(row.kickoffDate).toBe("2026-04-25");
    expect(mockCancelReminderJobs).toHaveBeenCalledWith(1001);
    expect(mockScheduleReminderJobs).toHaveBeenCalledWith(1001, row.id, "2026-04-25", "14:00");
  });

  it("emits referee.slots.needed when an assigned our-club slot opens up", async () => {
    mockFetchOffeneSpiele.mockResolvedValue(feed(makeApiResult({ sr1: makeSr() })));
    await syncRefereeGames();
    expect((await gameRow()).sr1Status).toBe("assigned");
    vi.clearAllMocks();

    mockFetchOffeneSpiele.mockResolvedValue(
      feed(makeApiResult({ sr1: null, sr1MeinVerein: true, sr1OffenAngeboten: false })),
    );
    const counts = await syncRefereeGames();

    expect(counts.updated).toBe(1);
    expect((await gameRow()).sr1Status).toBe("open");
    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "referee.slots.needed" }),
    );
  });

  it("uses the current (mapped) ourClub flag for slot-opened detection, not the stale row (#82)", async () => {
    // Stored row says the slot is not ours; this sync says it is. Gating on the
    // stale flag would suppress the event.
    mockFetchOffeneSpiele.mockResolvedValue(
      feed(makeApiResult({ sr1: makeSr(), sr1MeinVerein: false })),
    );
    await syncRefereeGames();
    expect((await gameRow()).sr1OurClub).toBe(false);
    vi.clearAllMocks();

    mockFetchOffeneSpiele.mockResolvedValue(
      feed(makeApiResult({ sr1: null, sr1MeinVerein: true, sr1OffenAngeboten: false })),
    );
    const counts = await syncRefereeGames();

    expect(counts.updated).toBe(1);
    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "referee.slots.needed" }),
    );
  });

  it("cancels reminders when a game is cancelled on update", async () => {
    mockFetchOffeneSpiele.mockResolvedValue(
      feed(makeApiResult({ sr1: null, sr1MeinVerein: true, sr1OffenAngeboten: false })),
    );
    await syncRefereeGames();
    vi.clearAllMocks();

    const cancelled = makeApiResult({ sr1: null, sr1MeinVerein: true, sr1OffenAngeboten: false });
    cancelled.sp.abgesagt = true;
    mockFetchOffeneSpiele.mockResolvedValue(feed(cancelled));

    const counts = await syncRefereeGames();

    expect(counts.updated).toBe(1);
    expect((await gameRow()).isCancelled).toBe(true);
    expect(mockCancelReminderJobs).toHaveBeenCalledWith(1001);
    expect(mockPublishDomainEvent).not.toHaveBeenCalled();
  });

  it("continues processing when one game's write fails", async () => {
    const first = makeApiResult();
    const second = makeApiResult();
    second.sp.spielplanId = 2002;
    second.sp.spielnr = 99;
    mockFetchOffeneSpiele.mockResolvedValue(feed(first, second));

    const real = ctx.db as unknown as Record<string | symbol, unknown>;
    let insertCall = 0;
    dbHolder.ref = new Proxy(
      {},
      {
        get: (_t, prop) =>
          prop === "insert"
            ? (...args: unknown[]) => {
                insertCall++;
                if (insertCall === 1) {
                  return {
                    values: () => ({
                      onConflictDoUpdate: () => ({
                        returning: () => Promise.reject(new Error("DB connection lost")),
                      }),
                    }),
                  };
                }
                return (real.insert as (...a: unknown[]) => unknown)(...args);
              }
            : real[prop],
      },
    );

    const counts = await syncRefereeGames();

    expect(counts.created).toBe(1);
    const rows = await gameRows();
    expect(rows.map((r) => r.apiMatchId)).toEqual([2002]);
  });

  it("sets isHomeGame/isGuestGame from the configured club id", async () => {
    mockFetchOffeneSpiele.mockResolvedValue(feed(makeApiResult()));

    await syncRefereeGames();

    const row = await gameRow();
    expect(row.isHomeGame).toBe(true); // homeClubId 300 === configured clubId
    expect(row.isGuestGame).toBe(false);
    expect(row.homeClubId).toBe(300);
    expect(row.guestClubId).toBe(301);
  });

  it("marks neither side when no club is configured", async () => {
    mockGetClubConfig.mockResolvedValue(null);
    mockFetchOffeneSpiele.mockResolvedValue(feed(makeApiResult()));

    await syncRefereeGames();

    const row = await gameRow();
    expect(row.isHomeGame).toBe(false);
    expect(row.isGuestGame).toBe(false);
  });

  it("resolves homeTeamId/guestTeamId from the teams table", async () => {
    const [homeId, guestId] = await seedTeams([
      { clubId: 300, isOwnClub: true },
      { clubId: 301 },
    ]);
    mockFetchOffeneSpiele.mockResolvedValue(feed(makeApiResult()));

    await syncRefereeGames();

    const row = await gameRow();
    expect(row.homeTeamId).toBe(homeId);
    expect(row.guestTeamId).toBe(guestId);
  });

  it("leaves homeTeamId/guestTeamId null when no team matches the club id", async () => {
    await seedTeams([{ clubId: 999 }]);
    mockFetchOffeneSpiele.mockResolvedValue(feed(makeApiResult()));

    await syncRefereeGames();

    const row = await gameRow();
    expect(row.homeTeamId).toBeNull();
    expect(row.guestTeamId).toBeNull();
  });

  it("prefers the isOwnClub team when several teams share a club id", async () => {
    const ids = await seedTeams([
      { clubId: 300, isOwnClub: false },
      { clubId: 300, isOwnClub: true },
      { clubId: 301 },
    ]);
    mockFetchOffeneSpiele.mockResolvedValue(feed(makeApiResult()));

    await syncRefereeGames();

    const row = await gameRow();
    expect(row.homeTeamId).toBe(ids[1]);
    expect(row.guestTeamId).toBe(ids[2]);
  });

  it("carries the team ids through on the update path too", async () => {
    mockFetchOffeneSpiele.mockResolvedValue(feed(makeApiResult()));
    await syncRefereeGames();
    expect((await gameRow()).homeTeamId).toBeNull();

    const [homeId, guestId] = await seedTeams([
      { clubId: 300, isOwnClub: true },
      { clubId: 301 },
    ]);
    mockFetchOffeneSpiele.mockResolvedValue(feed(makeApiResult({ sr1: makeSr() })));

    const counts = await syncRefereeGames();

    expect(counts.updated).toBe(1);
    const row = await gameRow();
    expect(row.homeTeamId).toBe(homeId);
    expect(row.guestTeamId).toBe(guestId);
  });

  it("carries ownClubRefs from the league row", async () => {
    await seedLeague(10, true);
    mockFetchOffeneSpiele.mockResolvedValue(feed(makeApiResult()));

    await syncRefereeGames();

    expect((await gameRow()).ownClubRefs).toBe(true);
  });

  it("defaults ownClubRefs to false when the league is unknown", async () => {
    mockFetchOffeneSpiele.mockResolvedValue(feed(makeApiResult()));

    await syncRefereeGames();

    expect((await gameRow()).ownClubRefs).toBe(false);
  });

  it("logs created, skipped and failed entries to the sync logger", async () => {
    const mockLogger = { log: vi.fn().mockResolvedValue(undefined) };
    mockFetchOffeneSpiele.mockResolvedValue(
      feed(makeApiResult({ sr1: null, sr1MeinVerein: true, sr1OffenAngeboten: false })),
    );

    await syncRefereeGames(mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "refereeGame",
        entityId: "1001",
        entityName: "Dragons 1 vs Titans 1",
        action: "created",
        message: "New game with open our-club slot",
      }),
    );

    mockLogger.log.mockClear();
    mockFetchOffeneSpiele.mockResolvedValue(
      feed(makeApiResult({ sr1: null, sr1MeinVerein: true, sr1OffenAngeboten: false })),
    );
    await syncRefereeGames(mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "refereeGame", action: "skipped" }),
    );
  });

  it("logs a failed entry when a game cannot be written", async () => {
    const mockLogger = { log: vi.fn().mockResolvedValue(undefined) };
    mockFetchOffeneSpiele.mockResolvedValue(feed(makeApiResult()));
    overrideDbMethod("insert", () => ({
      values: () => ({
        onConflictDoUpdate: () => ({ returning: () => Promise.reject(new Error("nope")) }),
      }),
    }));

    await syncRefereeGames(mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "refereeGame",
        action: "failed",
        message: "nope",
      }),
    );
  });

  it("emits sync.completed with the real EVENT_TYPES constant when a syncRunId is given", async () => {
    mockFetchOffeneSpiele.mockResolvedValue(feed(makeApiResult()));

    await syncRefereeGames(undefined, 77);

    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "sync.completed",
        syncRunId: 77,
        deepLinkPath: "/admin/sync/logs/77",
        payload: expect.objectContaining({
          syncRunId: 77,
          syncType: "referee-games",
          recordsProcessed: 1,
          recordsCreated: 1,
          recordsUpdated: 0,
          recordsFailed: 0,
        }),
      }),
    );
  });

  it("does not emit sync.completed without a syncRunId", async () => {
    mockFetchOffeneSpiele.mockResolvedValue(feed(makeApiResult()));

    await syncRefereeGames();

    const types = mockPublishDomainEvent.mock.calls.map(
      (c: unknown[]) => (c[0] as Record<string, unknown>).type,
    );
    expect(types).not.toContain("sync.completed");
  });

  it("still returns counts when publishing sync.completed fails", async () => {
    mockFetchOffeneSpiele.mockResolvedValue(feed(makeApiResult()));
    mockPublishDomainEvent.mockRejectedValue(new Error("outbox down"));

    const counts = await syncRefereeGames(undefined, 77);

    expect(counts.created).toBe(1);
    expect(await gameRows()).toHaveLength(1);
  });

  it("survives a reminder-scheduling failure on insert", async () => {
    mockScheduleReminderJobs.mockRejectedValue(new Error("queue down"));
    mockFetchOffeneSpiele.mockResolvedValue(
      feed(makeApiResult({ sr1: null, sr1MeinVerein: true, sr1OffenAngeboten: false })),
    );

    const counts = await syncRefereeGames();

    expect(counts.created).toBe(1);
    expect(await gameRows()).toHaveLength(1);
  });

  it("survives an event-publishing failure on insert", async () => {
    mockPublishDomainEvent.mockRejectedValue(new Error("outbox down"));
    mockFetchOffeneSpiele.mockResolvedValue(
      feed(makeApiResult({ sr1: null, sr1MeinVerein: true, sr1OffenAngeboten: false })),
    );

    const counts = await syncRefereeGames();

    expect(counts.created).toBe(1);
    expect(mockScheduleReminderJobs).toHaveBeenCalled();
  });

  it("survives a reminder-cancellation failure when both slots fill", async () => {
    mockFetchOffeneSpiele.mockResolvedValue(
      feed(makeApiResult({ sr1: null, sr1MeinVerein: true, sr1OffenAngeboten: false })),
    );
    await syncRefereeGames();
    mockCancelReminderJobs.mockRejectedValue(new Error("queue down"));
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
    mockFetchOffeneSpiele.mockResolvedValue(feed(makeApiResult({ sr1: makeSr(), sr2 })));

    const counts = await syncRefereeGames();

    expect(counts.updated).toBe(1);
    expect((await gameRow()).sr2Status).toBe("assigned");
  });

  it("survives a reminder-cancellation failure on cancellation", async () => {
    mockFetchOffeneSpiele.mockResolvedValue(
      feed(makeApiResult({ sr1: null, sr1MeinVerein: true, sr1OffenAngeboten: false })),
    );
    await syncRefereeGames();
    mockCancelReminderJobs.mockRejectedValue(new Error("queue down"));
    const cancelled = makeApiResult({ sr1: null, sr1MeinVerein: true, sr1OffenAngeboten: false });
    cancelled.sp.abgesagt = true;
    mockFetchOffeneSpiele.mockResolvedValue(feed(cancelled));

    const counts = await syncRefereeGames();

    expect(counts.updated).toBe(1);
    expect((await gameRow()).isCancelled).toBe(true);
  });

  it("survives a reschedule failure when the kickoff moves", async () => {
    const early = makeApiResult({ sr1: null, sr1MeinVerein: true, sr1OffenAngeboten: false });
    early.sp.spieldatum = 1776686400000;
    mockFetchOffeneSpiele.mockResolvedValue(feed(early));
    await syncRefereeGames();
    mockCancelReminderJobs.mockRejectedValue(new Error("queue down"));
    mockFetchOffeneSpiele.mockResolvedValue(
      feed(makeApiResult({ sr1: null, sr1MeinVerein: true, sr1OffenAngeboten: false })),
    );

    const counts = await syncRefereeGames();

    expect(counts.updated).toBe(1);
    expect((await gameRow()).kickoffDate).toBe("2026-04-25");
  });

  it("survives an event-publishing failure when a slot opens", async () => {
    mockFetchOffeneSpiele.mockResolvedValue(feed(makeApiResult({ sr1: makeSr() })));
    await syncRefereeGames();
    mockPublishDomainEvent.mockRejectedValue(new Error("outbox down"));
    mockFetchOffeneSpiele.mockResolvedValue(
      feed(makeApiResult({ sr1: null, sr1MeinVerein: true, sr1OffenAngeboten: false })),
    );

    const counts = await syncRefereeGames();

    expect(counts.updated).toBe(1);
    expect((await gameRow()).sr1Status).toBe("open");
  });
});
