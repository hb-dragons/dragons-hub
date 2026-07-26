import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";

// Real Postgres (pglite) with real migrations, the real `eq` operator and the real
// `computeEntityHash`. The previous mocked-ORM version stubbed `eq` to an identity
// function and fed `select()` a fixed row list, so neither
// `where(eq(leagues.isTracked, true))` nor `where(eq(leagues.id, league.id))` was
// ever executed — flipping the tracked filter to `false` left all 18 tests green.
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

const mockGetTabelleResponse = vi.fn();
vi.mock("./sdk-client", () => ({
  sdkClient: {
    getTabelleResponse: (...args: unknown[]) => mockGetTabelleResponse(...args),
  },
}));

import { syncLeagues } from "./leagues.sync";
import { computeEntityHash } from "./hash";
import { leagues } from "@dragons/db/schema";
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
});

afterAll(async () => {
  await closeTestDb(ctx);
});

function makeLigaData(overrides: Record<string, unknown> = {}) {
  return {
    ligaId: 1,
    liganr: 100,
    liganame: "Test League",
    seasonId: 2025,
    seasonName: "2025/26",
    skName: "OL",
    akName: "Herren",
    geschlecht: "m",
    verbandId: 7,
    verbandName: "DBB",
    ...overrides,
  };
}

/** The hash the service will compute for a given ligaData payload. */
function hashOf(ligaData: ReturnType<typeof makeLigaData>): string {
  return computeEntityHash({
    ligaId: ligaData.ligaId,
    liganr: ligaData.liganr,
    liganame: ligaData.liganame,
    seasonId: ligaData.seasonId,
    seasonName: ligaData.seasonName,
    skName: ligaData.skName,
    akName: ligaData.akName,
    geschlecht: ligaData.geschlecht,
    verbandId: ligaData.verbandId,
    verbandName: ligaData.verbandName,
  });
}

async function seedLeague(overrides: Partial<typeof leagues.$inferInsert> = {}) {
  const [row] = await ctx.db
    .insert(leagues)
    .values({
      apiLigaId: 501,
      ligaNr: 100,
      name: "Test League",
      seasonId: 0,
      seasonName: "2024",
      dataHash: "old-hash",
      isTracked: true,
      ...overrides,
    })
    .returning();
  return row!;
}

async function leagueRow(id: number) {
  const [row] = await ctx.db.select().from(leagues).where(eq(leagues.id, id));
  return row!;
}

describe("syncLeagues", () => {
  it("returns an empty result when no tracked leagues exist", async () => {
    const result = await syncLeagues();

    expect(result.total).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(mockGetTabelleResponse).not.toHaveBeenCalled();
  });

  it("only syncs leagues where isTracked is true", async () => {
    const tracked = await seedLeague({ apiLigaId: 501, isTracked: true });
    const untracked = await seedLeague({ apiLigaId: 502, isTracked: false, name: "Untracked" });
    mockGetTabelleResponse.mockResolvedValue({ ligaData: makeLigaData() });

    const result = await syncLeagues();

    expect(result.total).toBe(1);
    expect(mockGetTabelleResponse).toHaveBeenCalledTimes(1);
    expect(mockGetTabelleResponse).toHaveBeenCalledWith(tracked.apiLigaId);
    // The untracked row must be completely untouched.
    expect((await leagueRow(untracked.id)).name).toBe("Untracked");
    expect((await leagueRow(untracked.id)).dataHash).toBe("old-hash");
  });

  it("persists league metadata from the tabelle response onto the matching row", async () => {
    const target = await seedLeague({ apiLigaId: 501 });
    const bystander = await seedLeague({ apiLigaId: 502, isTracked: false, name: "Bystander" });
    const ligaData = makeLigaData();
    mockGetTabelleResponse.mockResolvedValue({ ligaData });

    const result = await syncLeagues();

    expect(result.updated).toBe(1);
    expect(result.total).toBe(1);

    const row = await leagueRow(target.id);
    expect(row.ligaNr).toBe(100);
    expect(row.name).toBe("Test League");
    expect(row.seasonId).toBe(2025);
    expect(row.seasonName).toBe("2025/26");
    expect(row.skName).toBe("OL");
    expect(row.akName).toBe("Herren");
    expect(row.geschlecht).toBe("m");
    expect(row.verbandId).toBe(7);
    expect(row.verbandName).toBe("DBB");
    expect(row.dataHash).toBe(hashOf(ligaData));
    // Only the matching row moved.
    expect((await leagueRow(bystander.id)).name).toBe("Bystander");
  });

  it("skips a league when the stored hash matches the freshly computed one", async () => {
    const ligaData = makeLigaData();
    const league = await seedLeague({ dataHash: hashOf(ligaData) });
    mockGetTabelleResponse.mockResolvedValue({ ligaData });

    const result = await syncLeagues();

    expect(result.skipped).toBe(1);
    expect(result.updated).toBe(0);
    // Row untouched: the stale seasonId is still there.
    expect((await leagueRow(league.id)).seasonId).toBe(0);
  });

  it("skips a league when the response has no ligaData", async () => {
    const league = await seedLeague();
    mockGetTabelleResponse.mockResolvedValue({ ligaData: null });

    const result = await syncLeagues();

    expect(result.skipped).toBe(1);
    expect((await leagueRow(league.id)).dataHash).toBe("old-hash");
  });

  it("skips a league when the tabelle response is null", async () => {
    await seedLeague();
    mockGetTabelleResponse.mockResolvedValue(null);

    const result = await syncLeagues();

    expect(result.skipped).toBe(1);
  });

  it("handles per-league errors gracefully", async () => {
    await seedLeague();
    mockGetTabelleResponse.mockRejectedValue(new Error("API error"));

    const result = await syncLeagues();

    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("Failed to sync league");
    expect(result.errors[0]).toContain("API error");
  });

  it("handles non-Error thrown objects", async () => {
    await seedLeague();
    mockGetTabelleResponse.mockRejectedValue("string error");

    const result = await syncLeagues();

    expect(result.errors[0]).toContain("Unknown error");
  });

  it("handles a DB query error", async () => {
    dbHolder.ref = {
      select: () => {
        throw new Error("DB down");
      },
    };

    const result = await syncLeagues();

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Failed to fetch tracked leagues");
  });

  it("handles a non-Error DB query error", async () => {
    dbHolder.ref = {
      select: () => {
        throw "string error";
      },
    };

    const result = await syncLeagues();

    expect(result.errors[0]).toContain("Unknown error");
  });

  it("passes the 'updated' action to the sync logger", async () => {
    await seedLeague();
    mockGetTabelleResponse.mockResolvedValue({ ligaData: makeLigaData() });
    const mockLogger = { log: vi.fn() };

    await syncLeagues(mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "updated",
        entityType: "league",
        entityId: "501",
        entityName: "Test League",
      }),
    );
  });

  it("passes the 'skipped' action to the sync logger on a hash match", async () => {
    const ligaData = makeLigaData();
    await seedLeague({ dataHash: hashOf(ligaData) });
    mockGetTabelleResponse.mockResolvedValue({ ligaData });
    const mockLogger = { log: vi.fn() };

    await syncLeagues(mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "skipped", message: "No changes detected" }),
    );
  });

  it("passes the 'skipped' action to the sync logger when ligaData is missing", async () => {
    await seedLeague();
    mockGetTabelleResponse.mockResolvedValue({ ligaData: null });
    const mockLogger = { log: vi.fn() };

    await syncLeagues(mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "skipped",
        message: "No ligaData in tabelle response",
      }),
    );
  });

  it("passes the 'failed' action to the sync logger", async () => {
    await seedLeague();
    mockGetTabelleResponse.mockRejectedValue(new Error("fail"));
    const mockLogger = { log: vi.fn() };

    await syncLeagues(mockLogger as never);

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "failed" }),
    );
  });

  it("includes durationMs in the result", async () => {
    const result = await syncLeagues();

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("handles multiple tracked leagues independently", async () => {
    const ligaDataA = makeLigaData({ ligaId: 1, liganame: "League A" });
    const ligaDataB = makeLigaData({ ligaId: 2, liganame: "League B" });
    const a = await seedLeague({ apiLigaId: 501, dataHash: "stale" });
    const b = await seedLeague({ apiLigaId: 502, dataHash: hashOf(ligaDataB), name: "League B" });
    mockGetTabelleResponse.mockImplementation(async (apiLigaId: number) => ({
      ligaData: apiLigaId === 501 ? ligaDataA : ligaDataB,
    }));

    const result = await syncLeagues();

    expect(result.total).toBe(2);
    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(1);
    expect((await leagueRow(a.id)).name).toBe("League A");
    expect((await leagueRow(b.id)).seasonId).toBe(0); // skipped, still stale
  });

  it("keeps the existing name when ligaData.liganame is empty", async () => {
    const league = await seedLeague({ name: "Original Name" });
    mockGetTabelleResponse.mockResolvedValue({ ligaData: makeLigaData({ liganame: "" }) });

    await syncLeagues();

    expect((await leagueRow(league.id)).name).toBe("Original Name");
  });

  it("keeps the existing seasonName when ligaData.seasonName is empty", async () => {
    const league = await seedLeague({ seasonName: "2024" });
    mockGetTabelleResponse.mockResolvedValue({ ligaData: makeLigaData({ seasonName: "" }) });

    await syncLeagues();

    expect((await leagueRow(league.id)).seasonName).toBe("2024");
  });

  it("writes NULL for absent optional ligaData fields", async () => {
    const league = await seedLeague({
      skName: "OL",
      akName: "Herren",
      geschlecht: "m",
      verbandId: 7,
      verbandName: "DBB",
    });
    mockGetTabelleResponse.mockResolvedValue({
      ligaData: makeLigaData({
        skName: null,
        akName: null,
        geschlecht: null,
        verbandId: null,
        verbandName: null,
      }),
    });

    const result = await syncLeagues();

    expect(result.updated).toBe(1);
    const row = await leagueRow(league.id);
    expect(row.skName).toBeNull();
    expect(row.akName).toBeNull();
    expect(row.geschlecht).toBeNull();
    expect(row.verbandId).toBeNull();
    expect(row.verbandName).toBeNull();
  });
});
