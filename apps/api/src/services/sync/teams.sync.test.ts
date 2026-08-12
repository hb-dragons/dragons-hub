import { describe, expect, it, vi, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import type { SdkTeamRef } from "@dragons/sdk";

// Real Postgres (pglite) with real migrations, the real `sql`/`and`/`eq`/`ne`
// operators and the real `computeEntityHash`. The previous mocked-ORM version stubbed
// every operator to an identity function and hand-choreographed four `select()` return
// values in call order, so the corrective pass's predicates
// (`and(eq(clubId, ownClubId), eq(isOwnClub, false))` / `and(ne(clubId, ownClubId),
// eq(isOwnClub, true))`) never ran. Swapping `and` for `or` left all 19 tests green.
//
// This file covers counting, column mapping, the isOwnClub corrective pass and errors.
// displayOrder is entry-owned (team_entries) and covered by the reorder tests instead.
const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      { get: (_t, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop] },
    ),
}));

const mockLogInfo = vi.fn();
vi.mock("../../config/logger", () => ({
  logger: {
    child: () => ({
      info: (...args: unknown[]) => mockLogInfo(...args),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

const mockGetClubConfig = vi.fn();
vi.mock("../admin/settings.service", () => ({
  getClubConfig: (...args: unknown[]) => mockGetClubConfig(...args),
}));

import { syncTeamsFromData, buildTeamIdLookup } from "./teams.sync";
import { computeEntityHash } from "./hash";
import { teams } from "@dragons/db/schema";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";

let ctx: TestDbContext;

const OWN_CLUB_ID = 4121;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  dbHolder.ref = ctx.db;
  vi.clearAllMocks();
  mockGetClubConfig.mockResolvedValue({ clubId: OWN_CLUB_ID, clubName: "Dragons" });
  // Only Date is faked: pglite's WASM I/O needs real timers.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2025-06-01T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

function makeTeamRef(overrides: Partial<SdkTeamRef> = {}): SdkTeamRef {
  return {
    teamPermanentId: 1,
    seasonTeamId: 10,
    teamCompetitionId: 100,
    teamname: "Test Team",
    teamnameSmall: "TT",
    clubId: OWN_CLUB_ID,
    verzicht: false,
    ...overrides,
  };
}

function teamMap(...refs: SdkTeamRef[]) {
  return new Map(refs.map((r) => [r.teamPermanentId, r]));
}

async function teamRows() {
  return ctx.db.select().from(teams).orderBy(teams.apiTeamPermanentId);
}

async function teamRow(apiTeamPermanentId: number) {
  const [row] = await ctx.db
    .select()
    .from(teams)
    .where(eq(teams.apiTeamPermanentId, apiTeamPermanentId));
  if (!row) throw new Error(`team ${apiTeamPermanentId} not found`);
  return row;
}

/** Point getDb() at a db whose upsert rejects, while keeping the reads real. */
async function withFailingUpsert<T>(reason: unknown, fn: () => Promise<T>): Promise<T> {
  const real = ctx.db as unknown as Record<string | symbol, unknown>;
  dbHolder.ref = new Proxy(
    {},
    {
      get: (_t, prop) =>
        prop === "insert"
          ? () => ({
              values: () => ({
                onConflictDoUpdate: () => ({ returning: () => Promise.reject(reason) }),
              }),
            })
          : real[prop],
    },
  );
  try {
    return await fn();
  } finally {
    dbHolder.ref = ctx.db;
  }
}

describe("syncTeamsFromData", () => {
  it("returns early for an empty map without touching the database", async () => {
    const result = await syncTeamsFromData(new Map());

    expect(result.total).toBe(0);
    expect(result.created).toBe(0);
    expect(await teamRows()).toEqual([]);
  });

  it("creates new teams with every column mapped", async () => {
    const ref = makeTeamRef();

    const result = await syncTeamsFromData(teamMap(ref));

    expect(result.total).toBe(1);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);

    const row = await teamRow(1);
    expect(row.seasonTeamId).toBe(10);
    expect(row.teamCompetitionId).toBe(100);
    expect(row.name).toBe("Test Team");
    expect(row.nameShort).toBe("TT");
    expect(row.clubId).toBe(OWN_CLUB_ID);
    expect(row.verzicht).toBe(false);
    expect(row.dataHash).toBe(
      computeEntityHash({
        teamPermanentId: 1,
        seasonTeamId: 10,
        teamCompetitionId: 100,
        teamname: "Test Team",
        teamnameSmall: "TT",
        clubId: OWN_CLUB_ID,
        verzicht: false,
      }),
    );
  });

  it("counts an existing team with changed data as updated and rewrites its columns", async () => {
    await syncTeamsFromData(teamMap(makeTeamRef()));
    const afterCreate = await teamRow(1);

    vi.setSystemTime(new Date("2025-06-02T00:00:00.000Z"));
    const result = await syncTeamsFromData(
      teamMap(makeTeamRef({ teamname: "Renamed", seasonTeamId: 11, verzicht: true })),
    );

    expect(result.updated).toBe(1);
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(0);

    const row = await teamRow(1);
    expect(row.id).toBe(afterCreate.id);
    expect(row.name).toBe("Renamed");
    expect(row.seasonTeamId).toBe(11);
    expect(row.verzicht).toBe(true);
    expect(row.dataHash).not.toBe(afterCreate.dataHash);
  });

  it("skips an unchanged team on re-sync (dataHash change detection)", async () => {
    await syncTeamsFromData(teamMap(makeTeamRef()));
    const afterCreate = await teamRow(1);

    vi.setSystemTime(new Date("2025-06-02T00:00:00.000Z"));
    const result = await syncTeamsFromData(teamMap(makeTeamRef()));

    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect((await teamRow(1)).updatedAt.getTime()).toBe(afterCreate.updatedAt.getTime());
  });

  it("calculates created/updated/skipped across a mixed batch", async () => {
    await syncTeamsFromData(
      teamMap(
        makeTeamRef({ teamPermanentId: 1 }),
        makeTeamRef({ teamPermanentId: 2, teamname: "Two" }),
      ),
    );

    vi.setSystemTime(new Date("2025-06-02T00:00:00.000Z"));
    const result = await syncTeamsFromData(
      teamMap(
        makeTeamRef({ teamPermanentId: 1 }), // unchanged → skipped
        makeTeamRef({ teamPermanentId: 2, teamname: "Two renamed" }), // changed → updated
        makeTeamRef({ teamPermanentId: 3, teamname: "Three" }), // new → created
      ),
    );

    expect(result.total).toBe(3);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(1);
    expect((await teamRows()).map((t) => t.name)).toEqual([
      "Test Team",
      "Two renamed",
      "Three",
    ]);
  });

  it("handles a batch error and leaves the table untouched", async () => {
    const result = await withFailingUpsert(new Error("Batch failed"), () =>
      syncTeamsFromData(teamMap(makeTeamRef())),
    );

    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("Batch team sync failed");
    expect(await teamRows()).toEqual([]);
  });

  it("handles a non-Error batch failure", async () => {
    const result = await withFailingUpsert("string error", () =>
      syncTeamsFromData(teamMap(makeTeamRef())),
    );

    expect(result.errors[0]).toContain("Unknown error");
  });

  it("logs the batch result with the 'updated' action when changes exist", async () => {
    const mockLogger = { log: vi.fn() };

    await syncTeamsFromData(teamMap(makeTeamRef()), mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "team",
        entityId: "batch",
        action: "updated",
        metadata: { created: 1, updated: 0, skipped: 0 },
      }),
    );
  });

  it("logs the batch result with the 'skipped' action when all entries are skipped", async () => {
    await syncTeamsFromData(teamMap(makeTeamRef()));
    const mockLogger = { log: vi.fn() };

    vi.setSystemTime(new Date("2025-06-02T00:00:00.000Z"));
    await syncTeamsFromData(teamMap(makeTeamRef()), mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "team",
        entityId: "batch",
        action: "skipped",
        metadata: { created: 0, updated: 0, skipped: 1 },
      }),
    );
  });

  it("logs failure to the sync logger", async () => {
    const mockLogger = { log: vi.fn() };

    await withFailingUpsert(new Error("fail"), () =>
      syncTeamsFromData(teamMap(makeTeamRef()), mockLogger as never),
    );

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "failed" }),
    );
  });

  it("persists isOwnClub based on the club config", async () => {
    await syncTeamsFromData(
      teamMap(
        makeTeamRef({ teamPermanentId: 1, clubId: OWN_CLUB_ID }),
        makeTeamRef({ teamPermanentId: 2, clubId: 9999, teamname: "Other" }),
      ),
    );

    expect((await teamRow(1)).isOwnClub).toBe(true);
    expect((await teamRow(2)).isOwnClub).toBe(false);
  });

  it("treats every team as non-own and skips the corrective pass when no club config exists", async () => {
    mockGetClubConfig.mockResolvedValue(null);

    await syncTeamsFromData(teamMap(makeTeamRef({ clubId: OWN_CLUB_ID })));

    expect((await teamRow(1)).isOwnClub).toBe(false);
    // Corrective pass is gated on ownClubId > 0 — nothing was logged.
    expect(
      mockLogInfo.mock.calls.filter((c: unknown[]) => c[1] === "Corrected isOwnClub"),
    ).toHaveLength(0);
  });

  it("includes durationMs", async () => {
    const result = await syncTeamsFromData(new Map());

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("stores NULL for an empty teamnameSmall", async () => {
    await syncTeamsFromData(teamMap(makeTeamRef({ teamnameSmall: "" })));

    expect((await teamRow(1)).nameShort).toBeNull();
  });

  it("corrective pass marks an own-club row that the federation batch never touched", async () => {
    // Row is ours by clubId but flagged non-own, and is absent from the incoming
    // batch — only the table-wide corrective SELECT can reach it.
    await ctx.db.insert(teams).values({
      apiTeamPermanentId: 42,
      seasonTeamId: 420,
      teamCompetitionId: 4200,
      name: "Forgotten own team",
      clubId: OWN_CLUB_ID,
      isOwnClub: false,
    });

    await syncTeamsFromData(teamMap(makeTeamRef({ teamPermanentId: 1 })));

    expect((await teamRow(42)).isOwnClub).toBe(true);
    expect(mockLogInfo).toHaveBeenCalledWith(
      expect.objectContaining({ marked: 1, unmarked: 0 }),
      "Corrected isOwnClub",
    );
  });

  it("corrective pass marks an own-club team whose hash did not change", async () => {
    // Row already in the DB with the exact hash the sync will compute, but flagged
    // non-own — the upsert skips it, so only the corrective pass can fix it.
    const ref = makeTeamRef();
    await ctx.db.insert(teams).values({
      apiTeamPermanentId: ref.teamPermanentId,
      seasonTeamId: ref.seasonTeamId,
      teamCompetitionId: ref.teamCompetitionId,
      name: ref.teamname,
      nameShort: ref.teamnameSmall,
      clubId: ref.clubId,
      isOwnClub: false,
      verzicht: ref.verzicht,
      dataHash: computeEntityHash({
        teamPermanentId: ref.teamPermanentId,
        seasonTeamId: ref.seasonTeamId,
        teamCompetitionId: ref.teamCompetitionId,
        teamname: ref.teamname,
        teamnameSmall: ref.teamnameSmall,
        clubId: ref.clubId,
        verzicht: ref.verzicht,
      }),
    });

    const result = await syncTeamsFromData(teamMap(ref));

    expect(result.skipped).toBe(1); // upsert really did skip it
    expect((await teamRow(1)).isOwnClub).toBe(true);
    expect(mockLogInfo).toHaveBeenCalledWith(
      expect.objectContaining({ marked: 1, unmarked: 0 }),
      "Corrected isOwnClub",
    );
  });

  it("corrective pass unmarks teams whose clubId is no longer ours", async () => {
    await ctx.db.insert(teams).values([
      {
        apiTeamPermanentId: 3,
        seasonTeamId: 30,
        teamCompetitionId: 300,
        name: "Stale own A",
        clubId: 9999,
        isOwnClub: true,
      },
      {
        apiTeamPermanentId: 7,
        seasonTeamId: 70,
        teamCompetitionId: 700,
        name: "Stale own B",
        clubId: 8888,
        isOwnClub: true,
      },
    ]);

    await syncTeamsFromData(teamMap(makeTeamRef()));

    expect((await teamRow(3)).isOwnClub).toBe(false);
    expect((await teamRow(7)).isOwnClub).toBe(false);
    // The freshly synced own-club team is untouched by the unmark pass.
    expect((await teamRow(1)).isOwnClub).toBe(true);
    expect(mockLogInfo).toHaveBeenCalledWith(
      expect.objectContaining({ marked: 0, unmarked: 2 }),
      "Corrected isOwnClub",
    );
  });

  it("corrective pass skips logging when nothing needs correcting", async () => {
    await syncTeamsFromData(teamMap(makeTeamRef({ clubId: 9999 })));

    expect(
      mockLogInfo.mock.calls.filter((c: unknown[]) => c[1] === "Corrected isOwnClub"),
    ).toHaveLength(0);
  });
});

describe("buildTeamIdLookup", () => {
  it("returns a map from apiTeamPermanentId to the generated row id", async () => {
    await syncTeamsFromData(
      teamMap(
        makeTeamRef({ teamPermanentId: 100 }),
        makeTeamRef({ teamPermanentId: 200, teamname: "Other" }),
      ),
    );
    const rows = await teamRows();

    const lookup = await buildTeamIdLookup();

    expect(lookup.size).toBe(2);
    expect(lookup.get(100)).toBe(rows.find((r) => r.apiTeamPermanentId === 100)!.id);
    expect(lookup.get(200)).toBe(rows.find((r) => r.apiTeamPermanentId === 200)!.id);
  });

  it("returns an empty map when there are no teams", async () => {
    expect((await buildTeamIdLookup()).size).toBe(0);
  });
});
