import { describe, expect, it, beforeAll, beforeEach, afterAll, vi } from "vitest";

// --- Mock setup ---
//
// Only the federation SDK is stubbed — it is a network boundary. drizzle-orm
// and @dragons/db/schema are deliberately NOT mocked: the previous version of
// this file replaced `eq`/`and`/`notInArray` with identity stubs and counted
// `mockInsert` calls, so the upsert lookup could have matched on the wrong
// column and the untrack predicate could have been inverted with every test
// still green. Everything below runs against a real (in-process PGlite)
// Postgres.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
const mocks = vi.hoisted(() => ({ getAllLigen: vi.fn() }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

vi.mock("../sync/sdk-client", () => ({
  sdkClient: { getAllLigen: (...args: unknown[]) => mocks.getAllLigen(...args) },
}));

// --- Imports (after mocks) ---

import {
  resolveAndSaveLeagues,
  getTrackedLeagues,
  setLeagueOwnClubRefs,
} from "./league-discovery.service";
import { leagues } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import type { SdkLiga } from "@dragons/sdk";
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
  vi.clearAllMocks();
  mocks.getAllLigen.mockResolvedValue([]);
});

afterAll(async () => {
  await closeTestDb(ctx);
});

// --- Helpers ---

function makeLiga(overrides: Partial<SdkLiga> = {}): SdkLiga {
  return {
    ligaId: 58001,
    liganr: 4102,
    liganame: "Regionalliga West",
    seasonId: 2025,
    seasonName: "2025/26",
    skName: "RL",
    akName: "Herren",
    geschlecht: "m",
    verbandId: 7,
    verbandName: "DBB",
    ...overrides,
  } as SdkLiga;
}

/** Seed a league row directly, bypassing the service. */
async function seedLeague(opts: {
  apiLigaId: number;
  ligaNr: number;
  name?: string;
  isTracked?: boolean;
  ownClubRefs?: boolean;
}): Promise<number> {
  const [row] = await ctx.db
    .insert(leagues)
    .values({
      apiLigaId: opts.apiLigaId,
      ligaNr: opts.ligaNr,
      name: opts.name ?? `League ${opts.ligaNr}`,
      seasonId: 2025,
      seasonName: "2025/26",
      isTracked: opts.isTracked ?? true,
      ownClubRefs: opts.ownClubRefs ?? false,
    })
    .returning({ id: leagues.id });
  return row!.id;
}

async function allLeagues() {
  return ctx.db.select().from(leagues).orderBy(leagues.apiLigaId);
}

// --- Tests ---

describe("resolveAndSaveLeagues", () => {
  it("inserts a league that is not yet in the database", async () => {
    mocks.getAllLigen.mockResolvedValue([makeLiga()]);

    const result = await resolveAndSaveLeagues([4102]);

    expect(result.resolved).toEqual([
      { ligaNr: 4102, ligaId: 58001, name: "Regionalliga West", seasonName: "2025/26" },
    ]);
    expect(result.notFound).toEqual([]);
    expect(result.tracked).toBe(1);

    const rows = await allLeagues();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      apiLigaId: 58001,
      ligaNr: 4102,
      name: "Regionalliga West",
      seasonName: "2025/26",
      skName: "RL",
      akName: "Herren",
      geschlecht: "m",
      verbandId: 7,
      verbandName: "DBB",
      isTracked: true,
      isActive: true,
    });
  });

  it("updates the existing row instead of inserting a second one", async () => {
    // Note the ligaNr differs from apiLigaId, so a lookup on the wrong column
    // would miss and duplicate-insert (blocked by the unique index) instead.
    await seedLeague({ apiLigaId: 58001, ligaNr: 4102, name: "Stale name", isTracked: false });

    mocks.getAllLigen.mockResolvedValue([makeLiga({ liganame: "Fresh name" })]);

    const result = await resolveAndSaveLeagues([4102]);

    expect(result.tracked).toBe(1);
    const rows = await allLeagues();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("Fresh name");
    expect(rows[0]!.isTracked).toBe(true);
  });

  it("keeps insert-only columns when the upsert takes the conflict path (#77)", async () => {
    // The per-league SELECT-then-INSERT-or-UPDATE is one atomic upsert now.
    // `isActive` and `discoveredAt` must stay insert-only: a league someone
    // deactivated locally must not come back to life on the next resolve, and
    // the discovery timestamp is history, not current state.
    await seedLeague({ apiLigaId: 58001, ligaNr: 4102, isTracked: false });
    const discoveredAt = new Date("2020-01-01T00:00:00Z");
    await ctx.db
      .update(leagues)
      .set({ isActive: false, discoveredAt })
      .where(eq(leagues.apiLigaId, 58001));

    mocks.getAllLigen.mockResolvedValue([makeLiga({ liganame: "Fresh name" })]);

    await resolveAndSaveLeagues([4102]);

    const rows = await allLeagues();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("Fresh name");
    expect(rows[0]!.isTracked).toBe(true);
    expect(rows[0]!.isActive).toBe(false);
    expect(rows[0]!.discoveredAt).toEqual(discoveredAt);
  });

  it("leaves the tracked set untouched when the untrack pass fails (#77)", async () => {
    // Tracking is replaced as a whole. Split across statements, a failure
    // part-way left some leagues tracked and others already untracked, and the
    // sync picks its work from exactly that flag.
    await seedLeague({ apiLigaId: 58001, ligaNr: 4102, isTracked: true });
    await seedLeague({ apiLigaId: 58002, ligaNr: 4103, isTracked: true });
    mocks.getAllLigen.mockResolvedValue([makeLiga()]);

    const real = ctx.db as unknown as Record<string | symbol, unknown>;
    dbHolder.ref = new Proxy(
      {},
      {
        get: (_t, prop) =>
          prop === "transaction"
            ? (...args: unknown[]) => {
                const [cb, ...rest] = args as [(tx: unknown) => unknown, ...unknown[]];
                return (real.transaction as (...a: unknown[]) => unknown).call(
                  real,
                  (tx: Record<string | symbol, unknown>) =>
                    cb(
                      new Proxy(
                        {},
                        {
                          get: (_t2, p2) =>
                            p2 === "update"
                              ? () => {
                                  throw new Error("untrack failed");
                                }
                              : tx[p2],
                        },
                      ),
                    ),
                  ...rest,
                );
              }
            : real[prop],
      },
    );

    await expect(resolveAndSaveLeagues([4102])).rejects.toThrow("untrack failed");

    dbHolder.ref = ctx.db;
    const rows = await allLeagues();
    // The upsert of 58001 rolled back with the failed untrack of 58002.
    expect(rows.map((r) => r.isTracked)).toEqual([true, true]);
    expect(rows.find((r) => r.apiLigaId === 58001)!.name).toBe("League 4102");
  });

  it("reports league numbers the federation does not know", async () => {
    mocks.getAllLigen.mockResolvedValue([makeLiga()]);

    const result = await resolveAndSaveLeagues([4102, 9999]);

    expect(result.resolved.map((r) => r.ligaNr)).toEqual([4102]);
    expect(result.notFound).toEqual([9999]);
    expect(result.tracked).toBe(1);
  });

  it("untracks previously tracked leagues that are not in the new set", async () => {
    await seedLeague({ apiLigaId: 58001, ligaNr: 4102, isTracked: true }); // stays
    await seedLeague({ apiLigaId: 58002, ligaNr: 4105, isTracked: true }); // dropped
    await seedLeague({ apiLigaId: 58003, ligaNr: 4003, isTracked: true }); // dropped

    mocks.getAllLigen.mockResolvedValue([makeLiga()]);

    const result = await resolveAndSaveLeagues([4102]);

    expect(result.untracked).toBe(2);
    const rows = await allLeagues();
    expect(rows.map((r) => [r.apiLigaId, r.isTracked])).toEqual([
      [58001, true],
      [58002, false],
      [58003, false],
    ]);
  });

  it("does not re-count leagues that were already untracked", async () => {
    await seedLeague({ apiLigaId: 58002, ligaNr: 4105, isTracked: false });

    mocks.getAllLigen.mockResolvedValue([makeLiga()]);

    const result = await resolveAndSaveLeagues([4102]);

    expect(result.untracked).toBe(0);
  });

  it("untracks everything when no league number resolves", async () => {
    await seedLeague({ apiLigaId: 58001, ligaNr: 4102, isTracked: true });
    await seedLeague({ apiLigaId: 58002, ligaNr: 4105, isTracked: true });

    mocks.getAllLigen.mockResolvedValue([makeLiga()]);

    const result = await resolveAndSaveLeagues([9999, 8888]);

    expect(result.resolved).toEqual([]);
    expect(result.notFound).toEqual([9999, 8888]);
    expect(result.tracked).toBe(0);
    expect(result.untracked).toBe(2);
    expect((await allLeagues()).every((r) => r.isTracked === false)).toBe(true);
  });

  it("untracks everything when an empty array is passed", async () => {
    await seedLeague({ apiLigaId: 58001, ligaNr: 4102, isTracked: true });
    mocks.getAllLigen.mockResolvedValue([makeLiga()]);

    const result = await resolveAndSaveLeagues([]);

    expect(result).toMatchObject({ resolved: [], tracked: 0, untracked: 1 });
    expect((await allLeagues())[0]!.isTracked).toBe(false);
  });

  it("handles an empty SDK response", async () => {
    mocks.getAllLigen.mockResolvedValue([]);

    const result = await resolveAndSaveLeagues([4102]);

    expect(result).toMatchObject({ resolved: [], notFound: [4102], tracked: 0 });
    expect(await allLeagues()).toEqual([]);
  });

  it("normalises the SDK's empty/null optional fields on insert", async () => {
    // `seasonId`/`seasonName` are nullable in SdkLiga; the rest arrive as empty
    // strings / 0 from the federation and the service maps falsy -> NULL.
    mocks.getAllLigen.mockResolvedValue([
      makeLiga({
        seasonId: null,
        seasonName: null,
        skName: "",
        akName: "",
        geschlecht: "",
        verbandId: 0,
        verbandName: "",
      }),
    ]);

    const result = await resolveAndSaveLeagues([4102]);

    expect(result.resolved[0]).toMatchObject({ ligaNr: 4102, seasonName: "" });
    const [row] = await allLeagues();
    expect(row).toMatchObject({
      seasonId: 0,
      seasonName: "",
      skName: null,
      akName: null,
      geschlecht: null,
      verbandId: null,
      verbandName: null,
    });
  });

  it("resolves several league numbers at once", async () => {
    mocks.getAllLigen.mockResolvedValue([
      makeLiga({ ligaId: 58001, liganr: 4102, liganame: "Liga A" }),
      makeLiga({ ligaId: 58002, liganr: 4105, liganame: "Liga B" }),
      makeLiga({ ligaId: 58003, liganr: 4003, liganame: "Liga C" }),
    ]);

    const result = await resolveAndSaveLeagues([4102, 4105]);

    expect(result.resolved.map((r) => r.name)).toEqual(["Liga A", "Liga B"]);
    expect(result.tracked).toBe(2);
    expect((await allLeagues()).map((r) => r.apiLigaId)).toEqual([58001, 58002]);
  });
});

describe("getTrackedLeagues", () => {
  it("returns only the tracked leagues", async () => {
    await seedLeague({ apiLigaId: 58001, ligaNr: 4102, name: "Regionalliga West", isTracked: true });
    await seedLeague({ apiLigaId: 58002, ligaNr: 4105, name: "Oberliga", isTracked: true });
    await seedLeague({ apiLigaId: 58003, ligaNr: 4003, name: "Untracked", isTracked: false });

    const result = await getTrackedLeagues();

    expect(result.leagueNumbers.sort()).toEqual([4102, 4105]);
    expect(result.leagues.map((l) => l.name).sort()).toEqual(["Oberliga", "Regionalliga West"]);
  });

  it("returns an empty state when nothing is tracked", async () => {
    await seedLeague({ apiLigaId: 58001, ligaNr: 4102, isTracked: false });

    expect(await getTrackedLeagues()).toEqual({ leagueNumbers: [], leagues: [] });
  });

  it("defaults ownClubRefs to false when the column is null", async () => {
    const id = await seedLeague({ apiLigaId: 58001, ligaNr: 4102, isTracked: true });
    await ctx.db.update(leagues).set({ ownClubRefs: null }).where(eq(leagues.id, id));

    const result = await getTrackedLeagues();

    expect(result.leagues[0]!.ownClubRefs).toBe(false);
  });
});

describe("setLeagueOwnClubRefs", () => {
  it("flips the flag on the addressed league only", async () => {
    const target = await seedLeague({ apiLigaId: 58001, ligaNr: 4102 });
    await seedLeague({ apiLigaId: 58002, ligaNr: 4105 });

    await setLeagueOwnClubRefs(target, true);

    const rows = await allLeagues();
    expect(rows.map((r) => [r.apiLigaId, r.ownClubRefs])).toEqual([
      [58001, true],
      [58002, false],
    ]);
  });
});
