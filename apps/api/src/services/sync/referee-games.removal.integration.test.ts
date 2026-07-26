import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";

// Real Postgres (pglite): removal is destructive, so the WHERE clauses that
// decide which rows are tombstoned are executed for real rather than against
// identity-stubbed drizzle operators.
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

vi.mock("../referee/referee-reminders.service", () => ({
  scheduleReminderJobs: vi.fn().mockResolvedValue(undefined),
  cancelReminderJobs: vi.fn().mockResolvedValue(undefined),
}));

import { berlinDateString, removeWithdrawnRefereeGames } from "./referee-games.sync";
import { publishDomainEvent } from "../events/event-publisher";
import { cancelReminderJobs } from "../referee/referee-reminders.service";
import { refereeGames } from "@dragons/db/schema";
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
const cancelMock = vi.mocked(cancelReminderJobs);

const NOW = new Date("2026-03-10T12:00:00Z");

async function seedGame(apiMatchId: number, kickoffDate: string) {
  const [row] = await ctx.db
    .insert(refereeGames)
    .values({
      apiMatchId,
      matchNo: apiMatchId,
      kickoffDate,
      kickoffTime: "18:00:00",
      homeTeamName: "Home",
      guestTeamName: "Guest",
      leagueName: "Test Liga",
      sr1OurClub: true,
      sr2OurClub: false,
    })
    .returning({ id: refereeGames.id });
  return row!.id;
}

async function readGame(apiMatchId: number) {
  const [row] = await ctx.db
    .select()
    .from(refereeGames)
    .where(eq(refereeGames.apiMatchId, apiMatchId));
  return row!;
}

describe("berlinDateString", () => {
  it("uses the Berlin calendar day regardless of the host timezone", () => {
    // 23:30Z on 30 June is already 1 July in Berlin (UTC+2).
    expect(berlinDateString(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
    // 22:30Z on 31 December is still 31 December in Berlin (UTC+1).
    expect(berlinDateString(new Date("2026-12-31T22:30:00Z"))).toBe("2026-12-31");
  });
});

describe("removeWithdrawnRefereeGames — pagination guard (issue #105)", () => {
  it("removes nothing when pagination stopped short of the declared total", async () => {
    await seedGame(1000, "2026-04-01");

    const result = await removeWithdrawnRefereeGames(
      { total: 500, received: 200 },
      [2000],
      undefined,
      null,
      NOW,
    );

    expect(result.removed).toBe(0);
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/pagination/i);
    expect((await readGame(1000)).removedAt).toBeNull();
    expect(cancelMock).not.toHaveBeenCalled();
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("removes nothing when the feed declared no rows at all", async () => {
    await seedGame(1000, "2026-04-01");

    const result = await removeWithdrawnRefereeGames(
      { total: 0, received: 0 },
      [],
      undefined,
      null,
      NOW,
    );

    expect(result.removed).toBe(0);
    expect(result.skipped).toBe(true);
    expect((await readGame(1000)).removedAt).toBeNull();
  });

  it("trips the mass-removal breaker rather than tombstoning the whole feed", async () => {
    const apiIds = Array.from({ length: 20 }, (_, i) => 1000 + i);
    for (const apiId of apiIds) await seedGame(apiId, "2026-04-01");

    const result = await removeWithdrawnRefereeGames(
      { total: 1, received: 1 },
      [9999],
      undefined,
      null,
      NOW,
    );

    expect(result.removed).toBe(0);
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/mass removal/i);
    expect((await readGame(1000)).removedAt).toBeNull();
  });
});

describe("removeWithdrawnRefereeGames — removal semantics (issue #105)", () => {
  it("tombstones a withdrawn future game, cancels its reminders and emits match.removed", async () => {
    await seedGame(1000, "2026-04-01"); // withdrawn
    await seedGame(1001, "2026-04-02"); // still in the feed

    const result = await removeWithdrawnRefereeGames(
      { total: 1, received: 1 },
      [1001],
      undefined,
      null,
      NOW,
    );

    expect(result.removed).toBe(1);
    expect(result.skipped).toBe(false);
    expect((await readGame(1000)).removedAt).toBeInstanceOf(Date);
    expect((await readGame(1001)).removedAt).toBeNull();

    expect(cancelMock).toHaveBeenCalledTimes(1);
    expect(cancelMock).toHaveBeenCalledWith(1000);

    const removedEvents = publishMock.mock.calls
      .map((c) => c[0])
      .filter((e) => e.type === "match.removed");
    expect(removedEvents).toHaveLength(1);
    expect(removedEvents[0]!.payload).toMatchObject({
      matchNo: 1000,
      homeTeam: "Home",
      guestTeam: "Guest",
      leagueName: "Test Liga",
    });
  });

  it("never tombstones a past game — those roll off the feed by design", async () => {
    await seedGame(1000, "2026-01-05"); // long gone
    await seedGame(1001, "2026-03-09"); // yesterday

    const result = await removeWithdrawnRefereeGames(
      { total: 1, received: 1 },
      [9999],
      undefined,
      null,
      NOW,
    );

    expect(result.removed).toBe(0);
    expect((await readGame(1000)).removedAt).toBeNull();
    expect((await readGame(1001)).removedAt).toBeNull();
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it("treats today's game as removable", async () => {
    await seedGame(1000, "2026-03-10");

    const result = await removeWithdrawnRefereeGames(
      { total: 1, received: 1 },
      [9999],
      undefined,
      null,
      NOW,
    );

    expect(result.removed).toBe(1);
    expect((await readGame(1000)).removedAt).toBeInstanceOf(Date);
  });

  it("does nothing when every live future game is still in the feed", async () => {
    await seedGame(1000, "2026-04-01");

    const result = await removeWithdrawnRefereeGames(
      { total: 1, received: 1 },
      [1000],
      undefined,
      null,
      NOW,
    );

    expect(result.removed).toBe(0);
    expect(result.skipped).toBe(false);
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it("still tombstones when reminder cancellation and event publishing throw", async () => {
    await seedGame(1000, "2026-04-01");
    cancelMock.mockRejectedValueOnce(new Error("redis down"));
    publishMock.mockRejectedValueOnce(new Error("event bus down"));

    const result = await removeWithdrawnRefereeGames(
      { total: 1, received: 1 },
      [9999],
      undefined,
      null,
      NOW,
    );

    expect(result.removed).toBe(1);
    expect((await readGame(1000)).removedAt).toBeInstanceOf(Date);
  });

  it("leaves an already tombstoned game alone", async () => {
    await seedGame(1000, "2026-04-01");
    await ctx.db
      .update(refereeGames)
      .set({ removedAt: new Date("2026-03-01T00:00:00Z") })
      .where(eq(refereeGames.apiMatchId, 1000));

    const result = await removeWithdrawnRefereeGames(
      { total: 1, received: 1 },
      [9999],
      undefined,
      null,
      NOW,
    );

    expect(result.removed).toBe(0);
    expect(cancelMock).not.toHaveBeenCalled();
    expect(publishMock).not.toHaveBeenCalled();
  });
});
