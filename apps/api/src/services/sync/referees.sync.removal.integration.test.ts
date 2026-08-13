import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { eq, isNull } from "drizzle-orm";

// Real Postgres (pglite) with the real schema. Removal is a *destructive* path,
// so it is tested against real SQL: the mock-unit suite stubs drizzle operators
// to identity functions, which would let a wrong WHERE clause pass unnoticed.
const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      { get: (_t, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop] },
    ),
}));

vi.mock("../../config/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) },
}));

vi.mock("../events/event-publisher", () => ({
  publishDomainEvent: vi.fn().mockResolvedValue(undefined),
}));

import { removeStaleRefereeAssignments, confirmIntentsFromSync } from "./referees.sync";
import { publishDomainEvent } from "../events/event-publisher";
import type { LeagueFetchedData, ExtractedRefereeAssignment } from "./data-fetcher";
import {
  teams,
  matches,
  referees,
  refereeRoles,
  matchReferees,
  matchChanges,
  refereeGames,
  refereeAssignmentIntents,
} from "@dragons/db/schema";
import type { SdkGetGameResponse, SdkSpielplanMatch } from "@dragons/sdk";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

const publishMock = vi.mocked(publishDomainEvent);

// --- fixture builders -------------------------------------------------------

function emptySlot() {
  return { spielleitung: null, lizenzNr: null, offenAngeboten: true };
}

function usableDetail(): SdkGetGameResponse {
  return {
    game1: { spielplanId: 1 },
    sr1: emptySlot(),
    sr2: emptySlot(),
    sr3: emptySlot(),
  } as unknown as SdkGetGameResponse;
}

/** A response body that got cut off before the referee slots arrived. */
function truncatedDetail(): SdkGetGameResponse {
  return { game1: { spielplanId: 1 } } as unknown as SdkGetGameResponse;
}

function leagueFetch(
  requestedApiIds: number[],
  returned: Map<number, SdkGetGameResponse>,
): LeagueFetchedData[] {
  return [
    {
      leagueApiId: 1,
      leagueDbId: 1,
      leagueName: "Test Liga",
      seasonRefId: null,
      seasonStatus: "active",
      vorabliga: false,
      spielplan: requestedApiIds.map((matchId) => ({ matchId }) as SdkSpielplanMatch),
      tabelle: [],
      gameDetails: returned,
    },
  ];
}

function completeFetch(apiIds: number[]): LeagueFetchedData[] {
  return leagueFetch(apiIds, new Map(apiIds.map((id) => [id, usableDetail()])));
}

// --- seeding ----------------------------------------------------------------

async function seedTeamsAndRole() {
  await ctx.db.insert(teams).values([
    { apiTeamPermanentId: 10, seasonTeamId: 100, teamCompetitionId: 1, name: "Home", clubId: 1 },
    { apiTeamPermanentId: 20, seasonTeamId: 200, teamCompetitionId: 2, name: "Guest", clubId: 2 },
  ]);
  const [role] = await ctx.db
    .insert(refereeRoles)
    .values({ apiId: 1, name: "Schiedsrichter", shortName: "SR" })
    .returning({ id: refereeRoles.id });
  return role!.id;
}

async function seedMatch(apiMatchId: number, sr1Open = false) {
  const [match] = await ctx.db
    .insert(matches)
    .values({
      apiMatchId,
      matchNo: apiMatchId,
      matchDay: 1,
      kickoffDate: "2025-01-15",
      kickoffTime: "18:00:00",
      homeTeamApiId: 10,
      guestTeamApiId: 20,
      sr1Open,
    })
    .returning({ id: matches.id });
  return match!.id;
}

async function seedReferee(apiId: number, lastName: string) {
  const [ref] = await ctx.db
    .insert(referees)
    .values({ apiId, firstName: "Ref", lastName })
    .returning({ id: referees.id });
  return ref!.id;
}

async function liveAssignments(matchId: number) {
  return ctx.db
    .select()
    .from(matchReferees)
    .where(eq(matchReferees.matchId, matchId));
}

// ---------------------------------------------------------------------------

describe("removeStaleRefereeAssignments — partial fetch guard (issue #105)", () => {
  it("removes nothing when the game-detail batch came back truncated", async () => {
    const roleId = await seedTeamsAndRole();
    const refId = await seedReferee(9001, "Eins");
    const requested = Array.from({ length: 20 }, (_, i) => 1000 + i);
    const matchId = await seedMatch(1000);
    await ctx.db.insert(matchReferees).values({ matchId, refereeId: refId, roleId, slotNumber: 1 });

    // 20 matches asked for, 2 details came back — a rate-limited or truncated
    // batch. It must not read as "18 matches lost their referees".
    const data = leagueFetch(
      requested,
      new Map([
        [1000, usableDetail()],
        [1001, usableDetail()],
      ]),
    );

    const result = await removeStaleRefereeAssignments(data, [], new Map([[1000, matchId]]));

    expect(result.removed).toBe(0);
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/coverage/i);
    const rows = await liveAssignments(matchId);
    expect(rows[0]!.removedAt).toBeNull();
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("removes nothing when every detail payload is structurally truncated", async () => {
    const roleId = await seedTeamsAndRole();
    const refId = await seedReferee(9001, "Eins");
    const matchId = await seedMatch(1000);
    await ctx.db.insert(matchReferees).values({ matchId, refereeId: refId, roleId, slotNumber: 1 });

    // Every request "succeeded" but the bodies have no referee slots at all.
    const data = leagueFetch([1000], new Map([[1000, truncatedDetail()]]));

    const result = await removeStaleRefereeAssignments(data, [], new Map([[1000, matchId]]));

    expect(result.removed).toBe(0);
    expect(result.skipped).toBe(true);
    const rows = await liveAssignments(matchId);
    expect(rows[0]!.removedAt).toBeNull();
  });

  it("removes nothing when the run fetched no leagues at all", async () => {
    const roleId = await seedTeamsAndRole();
    const refId = await seedReferee(9001, "Eins");
    const matchId = await seedMatch(1000);
    await ctx.db.insert(matchReferees).values({ matchId, refereeId: refId, roleId, slotNumber: 1 });

    const result = await removeStaleRefereeAssignments([], [], new Map([[1000, matchId]]));

    expect(result.removed).toBe(0);
    expect(result.skipped).toBe(true);
    const rows = await liveAssignments(matchId);
    expect(rows[0]!.removedAt).toBeNull();
  });

  it("spares a match whose own detail fetch failed even when the run is otherwise healthy", async () => {
    const roleId = await seedTeamsAndRole();
    const refId = await seedReferee(9001, "Eins");
    const requested = Array.from({ length: 20 }, (_, i) => 1000 + i);
    const blindMatchId = await seedMatch(1000);
    await ctx.db
      .insert(matchReferees)
      .values({ matchId: blindMatchId, refereeId: refId, roleId, slotNumber: 1 });

    // 19 of 20 details came back (95% — above the floor) but match 1000's did not.
    const returned = new Map(requested.slice(1).map((id) => [id, usableDetail()]));
    const data = leagueFetch(requested, returned);

    const result = await removeStaleRefereeAssignments(
      data,
      [],
      new Map(requested.map((id) => [id, id === 1000 ? blindMatchId : id + 5000])),
    );

    expect(result.skipped).toBe(false);
    expect(result.removed).toBe(0);
    const rows = await liveAssignments(blindMatchId);
    expect(rows[0]!.removedAt).toBeNull();
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("trips the mass-removal breaker rather than wiping every assignment", async () => {
    const roleId = await seedTeamsAndRole();
    const apiIds = Array.from({ length: 20 }, (_, i) => 1000 + i);
    const lookup = new Map<number, number>();
    for (const apiId of apiIds) {
      const matchId = await seedMatch(apiId);
      lookup.set(apiId, matchId);
      const refId = await seedReferee(9000 + apiId, `Ref${apiId}`);
      await ctx.db.insert(matchReferees).values({ matchId, refereeId: refId, roleId, slotNumber: 1 });
    }

    // A complete-looking fetch that reports nobody on any slot anywhere.
    const result = await removeStaleRefereeAssignments(completeFetch(apiIds), [], lookup);

    expect(result.removed).toBe(0);
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/mass removal/i);
    const survivors = await ctx.db
      .select()
      .from(matchReferees)
      .where(isNull(matchReferees.removedAt));
    expect(survivors).toHaveLength(20);
  });
});

describe("removeStaleRefereeAssignments — removal semantics (issue #105)", () => {
  it("tombstones the assignment and emits referee.unassigned", async () => {
    const roleId = await seedTeamsAndRole();
    const refId = await seedReferee(9001, "Weg");
    const keptRefId = await seedReferee(9002, "Bleibt");
    const apiIds = [1000, 1001];
    const droppedMatchId = await seedMatch(1000, true);
    const keptMatchId = await seedMatch(1001);
    await ctx.db
      .insert(matchReferees)
      .values({ matchId: droppedMatchId, refereeId: refId, roleId, slotNumber: 1 });
    await ctx.db
      .insert(matchReferees)
      .values({ matchId: keptMatchId, refereeId: keptRefId, roleId, slotNumber: 1 });

    // Upstream still reports the second match's referee, not the first's.
    const upstream: ExtractedRefereeAssignment[] = [
      { matchApiId: 1001, schiedsrichterId: 9002, schirirolleId: 1, slotNumber: 1 },
    ];

    const result = await removeStaleRefereeAssignments(
      completeFetch(apiIds),
      upstream,
      new Map([
        [1000, droppedMatchId],
        [1001, keptMatchId],
      ]),
    );

    expect(result.removed).toBe(1);
    expect(result.skipped).toBe(false);

    const [dropped] = await liveAssignments(droppedMatchId);
    expect(dropped!.removedAt).toBeInstanceOf(Date);
    const [kept] = await liveAssignments(keptMatchId);
    expect(kept!.removedAt).toBeNull();

    const unassigned = publishMock.mock.calls
      .map((c) => c[0])
      .filter((e) => e.type === "referee.unassigned");
    expect(unassigned).toHaveLength(1);
    expect(unassigned[0]!.payload).toMatchObject({
      refereeName: "Ref Weg",
      refereeId: refId,
      matchId: droppedMatchId,
    });
  });

  it("records the removal in the match change history", async () => {
    const roleId = await seedTeamsAndRole();
    const refId = await seedReferee(9001, "Weg");
    const matchId = await seedMatch(1000, true);
    await ctx.db.insert(matchReferees).values({ matchId, refereeId: refId, roleId, slotNumber: 2 });

    await removeStaleRefereeAssignments(completeFetch([1000]), [], new Map([[1000, matchId]]));

    const changes = await ctx.db.select().from(matchChanges).where(eq(matchChanges.matchId, matchId));
    expect(changes).toHaveLength(1);
    expect(changes[0]!.fieldName).toBe("referee_slot_2");
    expect(changes[0]!.oldValue).toContain("Ref Weg");
    expect(changes[0]!.newValue).toBeNull();
  });

  it("re-advertises the reopened slot when the federation flags it open", async () => {
    const roleId = await seedTeamsAndRole();
    const refId = await seedReferee(9001, "Weg");
    const matchId = await seedMatch(1000, true);
    await ctx.db.insert(matchReferees).values({ matchId, refereeId: refId, roleId, slotNumber: 1 });
    await ctx.db.insert(refereeGames).values({
      apiMatchId: 1000,
      matchId,
      matchNo: 1000,
      kickoffDate: "2025-01-15",
      kickoffTime: "18:00:00",
      homeTeamName: "Home",
      guestTeamName: "Guest",
      leagueName: "Test Liga",
      sr1OurClub: true,
      sr2OurClub: false,
    });

    await removeStaleRefereeAssignments(completeFetch([1000]), [], new Map([[1000, matchId]]));

    const advertised = publishMock.mock.calls
      .map((c) => c[0])
      .filter((e) => e.type === "referee.slots.needed");
    expect(advertised).toHaveLength(1);
    expect(advertised[0]!.payload).toMatchObject({ sr1Open: true, matchId });
  });

  // Regression: loadRemovalContext read refereeGames with no tombstone filter,
  // so a game the federation had already withdrawn was still advertised as
  // needing a referee when one of its matchReferees rows later went stale.
  it("does not re-advertise a slot on a tombstoned referee game", async () => {
    const roleId = await seedTeamsAndRole();
    const refId = await seedReferee(9001, "Weg");
    const matchId = await seedMatch(1000, true);
    await ctx.db.insert(matchReferees).values({ matchId, refereeId: refId, roleId, slotNumber: 1 });
    await ctx.db.insert(refereeGames).values({
      apiMatchId: 1000,
      matchId,
      matchNo: 1000,
      kickoffDate: "2025-01-15",
      kickoffTime: "18:00:00",
      homeTeamName: "Home",
      guestTeamName: "Guest",
      leagueName: "Test Liga",
      sr1OurClub: true,
      sr2OurClub: false,
      // The federation stopped listing this game; it is history, not an opening.
      removedAt: new Date(),
    });

    await removeStaleRefereeAssignments(completeFetch([1000]), [], new Map([[1000, matchId]]));

    const advertised = publishMock.mock.calls
      .map((c) => c[0])
      .filter((e) => e.type === "referee.slots.needed");
    expect(advertised).toHaveLength(0);
  });

  it("does not re-advertise a slot the federation has not reopened", async () => {
    const roleId = await seedTeamsAndRole();
    const refId = await seedReferee(9001, "Weg");
    const matchId = await seedMatch(1000, false);
    await ctx.db.insert(matchReferees).values({ matchId, refereeId: refId, roleId, slotNumber: 1 });
    await ctx.db.insert(refereeGames).values({
      apiMatchId: 1000,
      matchId,
      matchNo: 1000,
      kickoffDate: "2025-01-15",
      kickoffTime: "18:00:00",
      homeTeamName: "Home",
      guestTeamName: "Guest",
      sr1OurClub: true,
      sr2OurClub: false,
    });

    await removeStaleRefereeAssignments(completeFetch([1000]), [], new Map([[1000, matchId]]));

    const advertised = publishMock.mock.calls
      .map((c) => c[0])
      .filter((e) => e.type === "referee.slots.needed");
    expect(advertised).toHaveLength(0);
  });

  it("treats a slot the feed still reports as filled as present, whoever holds it", async () => {
    const roleId = await seedTeamsAndRole();
    const refId = await seedReferee(9001, "Alt");
    const matchId = await seedMatch(1000);
    await ctx.db.insert(matchReferees).values({ matchId, refereeId: refId, roleId, slotNumber: 1 });

    // Reassignment, not removal — a different referee occupies the same slot.
    const upstream: ExtractedRefereeAssignment[] = [
      { matchApiId: 1000, schiedsrichterId: 9999, schirirolleId: 1, slotNumber: 1 },
    ];

    const result = await removeStaleRefereeAssignments(
      completeFetch([1000]),
      upstream,
      new Map([[1000, matchId]]),
    );

    expect(result.removed).toBe(0);
    const [row] = await liveAssignments(matchId);
    expect(row!.removedAt).toBeNull();
  });

  it("removes nothing when no observed match maps to a local row", async () => {
    const roleId = await seedTeamsAndRole();
    const refId = await seedReferee(9001, "Eins");
    const matchId = await seedMatch(1000, true);
    await ctx.db.insert(matchReferees).values({ matchId, refereeId: refId, roleId, slotNumber: 1 });

    // Observed upstream, but the local match lookup knows none of them.
    const result = await removeStaleRefereeAssignments(completeFetch([1000]), [], new Map());

    expect(result.removed).toBe(0);
    expect(result.skipped).toBe(false);
    const [row] = await liveAssignments(matchId);
    expect(row!.removedAt).toBeNull();
  });

  it("removes a slot-3 assignment without trying to advertise it", async () => {
    const roleId = await seedTeamsAndRole();
    const refId = await seedReferee(9001, "Drei");
    const matchId = await seedMatch(1000, true);
    await ctx.db.insert(matchReferees).values({ matchId, refereeId: refId, roleId, slotNumber: 3 });
    await ctx.db.insert(refereeGames).values({
      apiMatchId: 1000,
      matchId,
      matchNo: 1000,
      kickoffDate: "2025-01-15",
      kickoffTime: "18:00:00",
      homeTeamName: "Home",
      guestTeamName: "Guest",
      sr1OurClub: true,
      sr2OurClub: true,
    });

    const result = await removeStaleRefereeAssignments(
      completeFetch([1000]),
      [],
      new Map([[1000, matchId]]),
    );

    expect(result.removed).toBe(1);
    // refereeGames only models SR1/SR2 — slot 3 has nowhere to be advertised.
    expect(
      publishMock.mock.calls.map((c) => c[0]).filter((e) => e.type === "referee.slots.needed"),
    ).toHaveLength(0);
  });

  it("does not advertise a reopened slot that is not one of our club's", async () => {
    const roleId = await seedTeamsAndRole();
    const refId = await seedReferee(9001, "Weg");
    const matchId = await seedMatch(1000, true);
    await ctx.db.insert(matchReferees).values({ matchId, refereeId: refId, roleId, slotNumber: 1 });
    await ctx.db.insert(refereeGames).values({
      apiMatchId: 1000,
      matchId,
      matchNo: 1000,
      kickoffDate: "2025-01-15",
      kickoffTime: "18:00:00",
      homeTeamName: "Home",
      guestTeamName: "Guest",
      sr1OurClub: false,
      sr2OurClub: false,
    });

    await removeStaleRefereeAssignments(completeFetch([1000]), [], new Map([[1000, matchId]]));

    expect(
      publishMock.mock.calls.map((c) => c[0]).filter((e) => e.type === "referee.slots.needed"),
    ).toHaveLength(0);
  });

  it("still tombstones the row when event publishing throws", async () => {
    const roleId = await seedTeamsAndRole();
    const refId = await seedReferee(9001, "Weg");
    const matchId = await seedMatch(1000, true);
    await ctx.db.insert(matchReferees).values({ matchId, refereeId: refId, roleId, slotNumber: 1 });
    await ctx.db.insert(refereeGames).values({
      apiMatchId: 1000,
      matchId,
      matchNo: 1000,
      kickoffDate: "2025-01-15",
      kickoffTime: "18:00:00",
      homeTeamName: "Home",
      guestTeamName: "Guest",
      sr1OurClub: true,
      sr2OurClub: false,
    });
    publishMock.mockRejectedValue(new Error("event bus down"));

    const result = await removeStaleRefereeAssignments(
      completeFetch([1000]),
      [],
      new Map([[1000, matchId]]),
    );

    expect(result.removed).toBe(1);
    expect(result.errors).toEqual([]);
    const [row] = await liveAssignments(matchId);
    expect(row!.removedAt).toBeInstanceOf(Date);
    // beforeEach's clearAllMocks does not clear a rejection set here.
    publishMock.mockReset();
  });

  it("leaves an already tombstoned row alone and emits nothing twice", async () => {
    const roleId = await seedTeamsAndRole();
    const refId = await seedReferee(9001, "Weg");
    const matchId = await seedMatch(1000, true);
    await ctx.db.insert(matchReferees).values({
      matchId,
      refereeId: refId,
      roleId,
      slotNumber: 1,
      removedAt: new Date("2025-01-01T00:00:00Z"),
    });

    const result = await removeStaleRefereeAssignments(
      completeFetch([1000]),
      [],
      new Map([[1000, matchId]]),
    );

    expect(result.removed).toBe(0);
    expect(publishMock).not.toHaveBeenCalled();
  });
});

describe("confirmIntentsFromSync — tombstones (issue #105)", () => {
  it("does not confirm an intent against a removed assignment", async () => {
    const roleId = await seedTeamsAndRole();
    const refId = await seedReferee(9001, "Weg");
    const matchId = await seedMatch(1000, true);
    await ctx.db.insert(matchReferees).values({
      matchId,
      refereeId: refId,
      roleId,
      slotNumber: 1,
      removedAt: new Date(),
    });
    await ctx.db
      .insert(refereeAssignmentIntents)
      .values({ matchId, refereeId: refId, slotNumber: 1 });

    const confirmed = await confirmIntentsFromSync();

    expect(confirmed).toBe(0);
    const [intent] = await ctx.db
      .select()
      .from(refereeAssignmentIntents)
      .where(eq(refereeAssignmentIntents.matchId, matchId));
    expect(intent!.confirmedBySyncAt).toBeNull();
  });
});
