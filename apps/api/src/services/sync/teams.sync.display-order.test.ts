import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  db: new Proxy(
    {},
    {
      get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
    },
  ),
}));

vi.mock("../admin/settings.service", () => ({
  getClubConfig: vi.fn(async () => ({ clubId: 999 })),
}));

vi.mock("../../config/logger", () => ({
  logger: { child: () => ({ info: vi.fn(), error: vi.fn() }) },
}));

import { syncTeamsFromData } from "./teams.sync";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";
import type { SdkTeamRef } from "@dragons/sdk";

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

function makeRef(overrides: Partial<SdkTeamRef> = {}): SdkTeamRef {
  return {
    teamPermanentId: 1,
    seasonTeamId: 100,
    teamCompetitionId: 200,
    teamname: "Team",
    teamnameSmall: "",
    clubId: 999,
    verzicht: false,
    ...overrides,
  } as SdkTeamRef;
}

async function fetchTeams() {
  const r = await ctx.client.query<{
    id: number;
    name: string;
    is_own_club: boolean;
    display_order: number;
  }>(`SELECT id, name, is_own_club, display_order FROM teams ORDER BY id`);
  return r.rows;
}

async function setDisplayOrder(apiTeamPermanentId: number, value: number) {
  await ctx.client.query(
    `UPDATE teams SET display_order = $1 WHERE api_team_permanent_id = $2`,
    [value, apiTeamPermanentId],
  );
}

describe("syncTeamsFromData displayOrder behavior", () => {
  it("assigns 0 to a single new own-club team and increments for additional ones in the same batch", async () => {
    const teamsMap = new Map<number, SdkTeamRef>([
      [1, makeRef({ teamPermanentId: 1, teamname: "A" })],
      [2, makeRef({ teamPermanentId: 2, teamname: "B" })],
      [3, makeRef({ teamPermanentId: 3, teamname: "C" })],
    ]);

    await syncTeamsFromData(teamsMap);

    const rows = await fetchTeams();
    expect(rows).toHaveLength(3);
    const orders = rows.map((r) => r.display_order).sort();
    expect(orders).toEqual([0, 1, 2]);
  });

  it("assigns 0 to non-own-club new teams", async () => {
    const teamsMap = new Map<number, SdkTeamRef>([
      [1, makeRef({ teamPermanentId: 1, teamname: "A", clubId: 999 })],
      [2, makeRef({ teamPermanentId: 2, teamname: "Foreign", clubId: 12345 })],
    ]);

    await syncTeamsFromData(teamsMap);

    const rows = await fetchTeams();
    const foreign = rows.find((r) => r.name === "Foreign")!;
    expect(foreign.is_own_club).toBe(false);
    expect(foreign.display_order).toBe(0);
  });

  it("preserves displayOrder on existing-row update", async () => {
    // First sync — creates team
    await syncTeamsFromData(
      new Map([[1, makeRef({ teamPermanentId: 1, teamname: "A" })]]),
    );
    await setDisplayOrder(1, 7);

    // Second sync with changed teamname (forces dataHash change → UPDATE)
    await syncTeamsFromData(
      new Map([[1, makeRef({ teamPermanentId: 1, teamname: "A renamed" })]]),
    );

    const rows = await fetchTeams();
    expect(rows[0]!.display_order).toBe(7);
    expect(rows[0]!.name).toBe("A renamed");
  });

  it("appends max+1 when adding a new own-club team to an existing set", async () => {
    await syncTeamsFromData(
      new Map([
        [1, makeRef({ teamPermanentId: 1, teamname: "A" })],
        [2, makeRef({ teamPermanentId: 2, teamname: "B" })],
      ]),
    );
    await setDisplayOrder(1, 5);
    await setDisplayOrder(2, 10);

    await syncTeamsFromData(
      new Map([
        [1, makeRef({ teamPermanentId: 1, teamname: "A" })],
        [2, makeRef({ teamPermanentId: 2, teamname: "B" })],
        [3, makeRef({ teamPermanentId: 3, teamname: "C" })],
      ]),
    );

    const rows = await fetchTeams();
    const c = rows.find((r) => r.name === "C")!;
    expect(c.display_order).toBe(11);
  });

  it("resets displayOrder to 0 when isOwnClub flips to false", async () => {
    await syncTeamsFromData(
      new Map([[1, makeRef({ teamPermanentId: 1, teamname: "A", clubId: 999 })]]),
    );
    await setDisplayOrder(1, 4);

    await syncTeamsFromData(
      new Map([[1, makeRef({ teamPermanentId: 1, teamname: "A", clubId: 12345 })]]),
    );

    const rows = await fetchTeams();
    expect(rows[0]!.is_own_club).toBe(false);
    expect(rows[0]!.display_order).toBe(0);
  });

  it("assigns max+1 when isOwnClub flips to true via the corrective pass", async () => {
    // Seed an own-club team to establish a max
    await syncTeamsFromData(
      new Map([[1, makeRef({ teamPermanentId: 1, teamname: "A", clubId: 999 })]]),
    );
    await setDisplayOrder(1, 3);

    // Insert a foreign team
    await syncTeamsFromData(
      new Map([[2, makeRef({ teamPermanentId: 2, teamname: "Foreign", clubId: 12345 })]]),
    );

    // Now flip team 2's club to ours
    await syncTeamsFromData(
      new Map([
        [1, makeRef({ teamPermanentId: 1, teamname: "A", clubId: 999 })],
        [2, makeRef({ teamPermanentId: 2, teamname: "Foreign", clubId: 999 })],
      ]),
    );

    const rows = await fetchTeams();
    const flipped = rows.find((r) => r.name === "Foreign")!;
    expect(flipped.is_own_club).toBe(true);
    expect(flipped.display_order).toBe(4);
  });
});
