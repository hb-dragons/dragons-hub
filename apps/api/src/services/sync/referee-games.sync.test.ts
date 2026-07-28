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
vi.mock("./sdk-client", () => ({
  sdkClient: {
    fetchOffeneSpiele: () => mockFetchOffeneSpiele(),
  },
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

/**
 * A referee_games row as a run that raced us would have left it: same
 * apiMatchId, stale everything else.
 */
async function seedRacedRow(
  overrides: Partial<typeof refereeGames.$inferInsert> = {},
  apiMatchId = 1001,
) {
  await ctx.db.insert(refereeGames).values({
    apiMatchId,
    matchNo: 1,
    kickoffDate: "2020-01-01",
    kickoffTime: "09:00:00",
    homeTeamName: "stale home",
    guestTeamName: "stale guest",
    sr1OurClub: false,
    sr2OurClub: false,
    dataHash: "stale",
    ...overrides,
  });
}

/**
 * Hide the referee_games batch pre-load from the sync, so it takes the INSERT
 * branch for a row that already exists — what a run whose insert commits after
 * our pre-load looks like from here. Everything else, including the re-read on
 * the conflict path, still goes to the real database.
 */
/**
 * Make the nth `getDb().transaction(...)` call fail. Each game's write is a
 * transaction (issue #77), so that is where a database failure now surfaces.
 */
function failNthTransaction(n: number, error: Error) {
  const real = ctx.db as unknown as Record<string | symbol, unknown>;
  let call = 0;
  dbHolder.ref = new Proxy(
    {},
    {
      get: (_t, prop) =>
        prop === "transaction"
          ? (...args: unknown[]) => {
              call++;
              if (call === n) return Promise.reject(error);
              return (real.transaction as (...a: unknown[]) => unknown).call(real, ...args);
            }
          : real[prop],
    },
  );
}

function hideRefereeGamesPreload({ alsoHideConflictReread = false } = {}) {
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
              // 5th is the conflict-path re-read of the row that beat us.
              if (alsoHideConflictReread && selectCall === 5) {
                return { from: () => ({ where: () => ({ limit: async () => [] }) }) };
              }
              return (real.select as (...a: unknown[]) => unknown)(...args);
            }
          : real[prop],
    },
  );
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
      // Published with the transaction client so the event commits with the row.
      expect.anything(),
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
      expect.anything(),
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
    await seedRacedRow({ sr1Status: "assigned", sr1Name: "Stale Ref" });
    hideRefereeGamesPreload();

    const counts = await syncRefereeGames();

    const rows = await gameRows();
    expect(rows).toHaveLength(1); // no duplicate row
    expect(rows[0]!.matchNo).toBe(42);
    expect(rows[0]!.homeTeamName).toBe("Dragons 1");
    expect(rows[0]!.kickoffDate).toBe("2026-04-25");
    expect(rows[0]!.dataHash).toBe(computeRefereeGameHash(mapApiResultToRow(result)));

    // Issue #85: the conflict UPDATEs an existing row, so it counts as an
    // update, not a creation.
    expect(counts.created).toBe(0);
    expect(counts.updated).toBe(1);
  });

  it("runs the UPDATE-branch transitions, not the INSERT ones, when the insert loses the race (#85)", async () => {
    // Our club's SR1 slot was assigned on the row a concurrent run wrote; the
    // feed now reports it open again. That is the slot-opened transition, which
    // only the UPDATE branch knows how to detect — the old conflict path ran the
    // INSERT side effects instead and scheduled a fresh set of reminder jobs.
    const result = makeApiResult({ sr1: null, sr1MeinVerein: true, sr1OffenAngeboten: false });
    mockFetchOffeneSpiele.mockResolvedValue(feed(result));
    // Same kickoff as the feed, so the only transition in play is the slot one.
    await seedRacedRow({
      sr1Status: "assigned",
      sr1Name: "Stale Ref",
      sr1OurClub: true,
      kickoffDate: "2026-04-25",
      kickoffTime: "14:00:00",
    });
    hideRefereeGamesPreload();

    const counts = await syncRefereeGames();

    expect(counts).toMatchObject({ created: 0, updated: 1, unchanged: 0 });

    const row = await gameRow();
    expect(row.sr1Status).toBe("open");
    // The event carries the id of the row that already existed.
    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "referee.slots.needed", entityId: row.id }),
      expect.anything(),
    );
    // Reminder jobs were rescheduled, which only the UPDATE branch does — the
    // INSERT branch never cancels.
    expect(mockCancelReminderJobs).toHaveBeenCalledWith(1001);
  });

  it("cancels reminders when the raced-in row is now cancelled (#85)", async () => {
    // The cancellation transition lives only in the UPDATE branch; on the old
    // conflict path a game that was withdrawn between the two runs kept its
    // reminder jobs and re-emitted "slots needed" instead.
    const result = makeApiResult({ sr1: null, sr1MeinVerein: true, sr1OffenAngeboten: false });
    result.sp.abgesagt = true;
    mockFetchOffeneSpiele.mockResolvedValue(feed(result));
    // Same kickoff as the feed, so the only transition in play is the slot one.
    await seedRacedRow({
      sr1Status: "assigned",
      sr1Name: "Stale Ref",
      sr1OurClub: true,
      kickoffDate: "2026-04-25",
      kickoffTime: "14:00:00",
    });
    hideRefereeGamesPreload();

    const counts = await syncRefereeGames();

    expect(counts).toMatchObject({ created: 0, updated: 1 });
    expect((await gameRow()).isCancelled).toBe(true);
    expect(mockCancelReminderJobs).toHaveBeenCalledWith(1001);
    expect(mockPublishDomainEvent).not.toHaveBeenCalled();
    expect(mockScheduleReminderJobs).not.toHaveBeenCalled();
  });

  it("skips the game when the row that won the race cannot be read back (#85)", async () => {
    const result = makeApiResult({ sr1: null, sr1MeinVerein: true, sr1OffenAngeboten: false });
    mockFetchOffeneSpiele.mockResolvedValue(feed(result));
    await seedRacedRow();
    hideRefereeGamesPreload({ alsoHideConflictReread: true });

    const counts = await syncRefereeGames();

    // Nothing to compare against means no transition can be decided, so the
    // game is left for the next run rather than counted or acted on.
    expect(counts).toMatchObject({ created: 0, updated: 0, unchanged: 0 });
    expect(mockPublishDomainEvent).not.toHaveBeenCalled();
    expect(mockScheduleReminderJobs).not.toHaveBeenCalled();
  });

  it("resolves two racing upserts of the same game into one insert and one update (#85)", async () => {
    // Two entries for the same apiMatchId in one run: the first takes the
    // INSERT branch, the second finds the row missing from the batch pre-load
    // (it was read before the first insert committed) and hits the real unique
    // constraint. That is the same collision two concurrent runs produce, and it
    // is resolved against a real PGlite index, not a stubbed branch.
    const first = makeApiResult({ sr1: null, sr1MeinVerein: true, sr1OffenAngeboten: false });
    const second = makeApiResult({ sr1: makeSr(), sr1MeinVerein: true, sr1OffenAngeboten: false });
    mockFetchOffeneSpiele.mockResolvedValue(feed(first, second));

    const counts = await syncRefereeGames();

    expect(counts).toMatchObject({ created: 1, updated: 1, unchanged: 0 });

    const rows = await gameRows();
    expect(rows).toHaveLength(1);
    // The second writer's data wins, and the row carries its hash.
    expect(rows[0]!.sr1Status).toBe("assigned");
    expect(rows[0]!.sr1Name).toBe("Hans Müller");
    expect(rows[0]!.dataHash).toBe(computeRefereeGameHash(mapApiResultToRow(second)));

    // The insert emitted "slots needed" once; the conflicting write took the
    // update path, where both slots are not yet filled and nothing reopened, so
    // it emitted nothing further.
    const slotEvents = mockPublishDomainEvent.mock.calls.filter(
      (c) => (c[0] as { type: string }).type === "referee.slots.needed",
    );
    expect(slotEvents).toHaveLength(1);
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
      expect.anything(),
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
      expect.anything(),
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

    failNthTransaction(1, new Error("DB connection lost"));

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
    failNthTransaction(1, new Error("nope"));

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
    // Only the run-level event fails; the per-game write must be unaffected.
    mockPublishDomainEvent.mockImplementation((event: { type: string }) =>
      event.type === "sync.completed"
        ? Promise.reject(new Error("outbox down"))
        : Promise.resolve(undefined),
    );

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

  it("rolls the insert back when the slots-needed event cannot be recorded (#77)", async () => {
    mockPublishDomainEvent.mockRejectedValue(new Error("outbox down"));
    mockFetchOffeneSpiele.mockResolvedValue(
      feed(makeApiResult({ sr1: null, sr1MeinVerein: true, sr1OffenAngeboten: false })),
    );

    const counts = await syncRefereeGames();

    // The game row and its referee.slots.needed event share a transaction: a
    // game nobody can be told about is not stored at all, and the next sync
    // retries it. The old behaviour stored the game, warned, and left the open
    // slot permanently unannounced.
    expect(counts.created).toBe(0);
    expect(await gameRows()).toHaveLength(0);
    expect(mockScheduleReminderJobs).not.toHaveBeenCalled();
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

  it("rolls the update back when the slot-opened event cannot be recorded (#77)", async () => {
    mockFetchOffeneSpiele.mockResolvedValue(feed(makeApiResult({ sr1: makeSr() })));
    await syncRefereeGames();
    mockPublishDomainEvent.mockRejectedValue(new Error("outbox down"));
    mockFetchOffeneSpiele.mockResolvedValue(
      feed(makeApiResult({ sr1: null, sr1MeinVerein: true, sr1OffenAngeboten: false })),
    );

    const counts = await syncRefereeGames();

    // Same unit of work as the insert: the row must not quietly record the slot
    // as open while the notification that it reopened was lost.
    expect(counts.updated).toBe(0);
    expect((await gameRow()).sr1Status).toBe("assigned");
  });

  /**
   * Issue #142. `refereeGames.apiMatchId` is unique, so the upsert deliberately
   * reads tombstoned rows — otherwise the insert would collide. What was missing
   * is the other half: the update left `removedAt` set, so a game the federation
   * withdrew and then re-listed stayed invisible everywhere (list, claim flow,
   * visibility service, history reads, reminder worker) while quietly receiving
   * fresh data.
   *
   * Decision: a game present in the feed is live, so the row resurrects in place.
   * A resurrected game is then treated like a new one — withdrawal cancelled its
   * reminder jobs and emitted match.removed, so reviving the row without
   * re-arming those leaves it visible but silent, which is the same missed
   * officiating duty in a different disguise.
   *
   * The withdrawal itself is applied directly here rather than driven through
   * `removeWithdrawnRefereeGames`; that function's guards have their own pglite
   * suite in referee-games.removal.integration.test.ts.
   */
  describe("re-listed after withdrawal (#142)", () => {
    async function tombstone(apiMatchId = 1001) {
      await ctx.db
        .update(refereeGames)
        .set({ removedAt: new Date("2026-03-01T00:00:00Z") })
        .where(eq(refereeGames.apiMatchId, apiMatchId));
    }

    const openSlotResult = () =>
      makeApiResult({ sr1: null, sr1MeinVerein: true, sr1OffenAngeboten: false });

    it("clears the tombstone when the game comes back with changed data", async () => {
      mockFetchOffeneSpiele.mockResolvedValue(feed(makeApiResult({ sr1: makeSr() })));
      await syncRefereeGames();
      const before = await gameRow();
      await tombstone();
      vi.clearAllMocks();

      // Comes back with the slot open — different data, so the hash differs too.
      mockFetchOffeneSpiele.mockResolvedValue(feed(openSlotResult()));
      const counts = await syncRefereeGames();

      const after = await gameRow();
      expect(counts.updated).toBe(1);
      expect(after.id).toBe(before.id); // resurrected in place, not a new row
      expect(after.removedAt).toBeNull();
      expect(after.sr1Status).toBe("open");
    });

    /**
     * The nastier half. `existing.dataHash !== hash` skipped the update
     * entirely, so a game re-listed with byte-identical data stayed tombstoned
     * forever — no amount of re-syncing would ever bring it back.
     */
    it("clears the tombstone even when the data is unchanged", async () => {
      mockFetchOffeneSpiele.mockResolvedValue(feed(openSlotResult()));
      await syncRefereeGames();
      const before = await gameRow();
      await tombstone();
      vi.clearAllMocks();

      mockFetchOffeneSpiele.mockResolvedValue(feed(openSlotResult()));
      const counts = await syncRefereeGames();

      const after = await gameRow();
      expect(after.removedAt).toBeNull();
      expect(after.id).toBe(before.id);
      expect(after.dataHash).toBe(before.dataHash);
      // Counted as an update, not skipped as unchanged: the row did change.
      expect(counts).toMatchObject({ updated: 1, unchanged: 0 });
    });

    it("re-emits referee.slots.needed and re-arms reminders for a revived open slot", async () => {
      mockFetchOffeneSpiele.mockResolvedValue(feed(openSlotResult()));
      await syncRefereeGames();
      await tombstone();
      vi.clearAllMocks();

      mockFetchOffeneSpiele.mockResolvedValue(feed(openSlotResult()));
      await syncRefereeGames();

      const row = await gameRow();
      expect(mockPublishDomainEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "referee.slots.needed" }),
        expect.anything(),
      );
      expect(mockScheduleReminderJobs).toHaveBeenCalledWith(1001, row.id, "2026-04-25", "14:00");
    });

    it("revives a re-listed game that is now cancelled without notifying", async () => {
      mockFetchOffeneSpiele.mockResolvedValue(feed(openSlotResult()));
      await syncRefereeGames();
      await tombstone();
      vi.clearAllMocks();

      const cancelled = openSlotResult();
      cancelled.sp.abgesagt = true;
      mockFetchOffeneSpiele.mockResolvedValue(feed(cancelled));
      await syncRefereeGames();

      const row = await gameRow();
      expect(row.removedAt).toBeNull();
      expect(row.isCancelled).toBe(true);
      expect(mockPublishDomainEvent).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: "referee.slots.needed" }),
        expect.anything(),
      );
      expect(mockScheduleReminderJobs).not.toHaveBeenCalled();
    });

    it("does not re-arm reminders for a revived game whose slots are already filled", async () => {
      mockFetchOffeneSpiele.mockResolvedValue(feed(openSlotResult()));
      await syncRefereeGames();
      await tombstone();
      vi.clearAllMocks();

      // Both slots taken by the time the federation re-lists it.
      const sr2 = makeSr({ spielleitungId: 2 });
      mockFetchOffeneSpiele.mockResolvedValue(feed(makeApiResult({ sr1: makeSr(), sr2 })));
      await syncRefereeGames();

      expect((await gameRow()).removedAt).toBeNull();
      expect(mockScheduleReminderJobs).not.toHaveBeenCalled();
    });

    it("leaves a live row's removedAt alone on an ordinary update", async () => {
      mockFetchOffeneSpiele.mockResolvedValue(feed(makeApiResult({ sr1: makeSr() })));
      await syncRefereeGames();
      vi.clearAllMocks();

      mockFetchOffeneSpiele.mockResolvedValue(feed(openSlotResult()));
      await syncRefereeGames();

      expect((await gameRow()).removedAt).toBeNull();
    });
  });
});
