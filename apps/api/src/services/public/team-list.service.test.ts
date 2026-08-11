import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

// --- Mocks (hoisted before imports) ---

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) =>
          (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

// --- Imports (after mocks) ---

import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";
import { teams } from "@dragons/db/schema";
import { listPublicTeams } from "./team-list.service";

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

describe("listPublicTeams", () => {
  it("orders own-club teams first, then by displayOrder, then name", async () => {
    await ctx.db.insert(teams).values([
      {
        apiTeamPermanentId: 1,
        seasonTeamId: 1,
        teamCompetitionId: 1,
        clubId: 1,
        name: "Zeta",
        isOwnClub: false,
        displayOrder: 1,
      },
      {
        apiTeamPermanentId: 2,
        seasonTeamId: 2,
        teamCompetitionId: 2,
        clubId: 1,
        name: "Alpha",
        isOwnClub: true,
        displayOrder: 2,
      },
      {
        apiTeamPermanentId: 3,
        seasonTeamId: 3,
        teamCompetitionId: 3,
        clubId: 1,
        name: "Beta",
        isOwnClub: true,
        displayOrder: 1,
      },
      // Shares both isOwnClub and displayOrder with Beta, differing only in
      // name — without this, isOwnClub + displayOrder alone already produce
      // the expected array below and asc(teams.name) is never exercised.
      {
        apiTeamPermanentId: 4,
        seasonTeamId: 4,
        teamCompetitionId: 4,
        clubId: 1,
        name: "Aaron",
        isOwnClub: true,
        displayOrder: 1,
      },
    ]);

    const result = await listPublicTeams();

    expect(result.map((t) => t.name)).toEqual(["Aaron", "Beta", "Alpha", "Zeta"]);
  });

  it("returns an empty array when no teams exist", async () => {
    expect(await listPublicTeams()).toEqual([]);
  });
});
