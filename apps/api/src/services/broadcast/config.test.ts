import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  db: new Proxy(
    {},
    {
      get: (_t, prop) =>
        (dbHolder.ref as Record<string | symbol, unknown>)[prop],
    },
  ),
}));

import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
} from "../../test/setup-test-db";
import type { TestDbContext } from "../../test/setup-test-db";
import {
  broadcastConfigs,
  leagues,
  matches,
  teams,
} from "@dragons/db/schema";
import {
  getBroadcastConfig,
  upsertBroadcastConfig,
  setBroadcastLive,
  loadJoinedMatch,
} from "./config";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});
beforeEach(async () => {
  await resetTestDb(ctx);
});
afterAll(async () => {
  await closeTestDb(ctx);
});

async function seed(): Promise<{ matchId: number }> {
  await ctx.db.insert(leagues).values({
    id: 100,
    apiLigaId: 100,
    ligaNr: 1,
    name: "Test Liga",
    seasonId: 2026,
    seasonName: "2025/26",
  });
  await ctx.db.insert(teams).values([
    {
      apiTeamPermanentId: 1,
      seasonTeamId: 1,
      teamCompetitionId: 1,
      name: "Dragons",
      nameShort: "Dragons",
      clubId: 42,
      isOwnClub: true,
    },
    {
      apiTeamPermanentId: 2,
      seasonTeamId: 2,
      teamCompetitionId: 2,
      name: "Visitors",
      nameShort: "Visitors",
      clubId: 99,
      isOwnClub: false,
    },
  ]);
  const [m] = await ctx.db
    .insert(matches)
    .values({
      apiMatchId: 1000,
      matchNo: 1,
      matchDay: 1,
      kickoffDate: "2026-05-02",
      kickoffTime: "19:30:00",
      leagueId: 100,
      homeTeamApiId: 1,
      guestTeamApiId: 2,
    })
    .returning({ id: matches.id });
  return { matchId: m!.id };
}

describe("broadcast/config", () => {
  it("returns null for unknown deviceId", async () => {
    expect(await getBroadcastConfig("nope")).toBeNull();
  });

  it("upserts a config row", async () => {
    const { matchId } = await seed();
    const row = await upsertBroadcastConfig({
      deviceId: "d1",
      matchId,
      homeAbbr: "DRA",
      guestAbbr: "VIS",
    });
    expect(row.deviceId).toBe("d1");
    expect(row.homeAbbr).toBe("DRA");
    const again = await upsertBroadcastConfig({
      deviceId: "d1",
      homeAbbr: "DGN",
    });
    expect(again.homeAbbr).toBe("DGN");
    expect(again.matchId).toBe(matchId); // unchanged
  });

  it("setBroadcastLive(true) requires a matchId", async () => {
    await upsertBroadcastConfig({ deviceId: "d1" });
    await expect(setBroadcastLive("d1", true)).rejects.toThrow(/matchId/);
  });

  it("setBroadcastLive sets startedAt/endedAt timestamps", async () => {
    const { matchId } = await seed();
    await upsertBroadcastConfig({ deviceId: "d1", matchId });
    const onRow = await setBroadcastLive("d1", true);
    expect(onRow.isLive).toBe(true);
    expect(onRow.startedAt).not.toBeNull();
    const offRow = await setBroadcastLive("d1", false);
    expect(offRow.isLive).toBe(false);
    expect(offRow.endedAt).not.toBeNull();
  });

  it("loadJoinedMatch returns home/guest with abbr fallback", async () => {
    const { matchId } = await seed();
    const m = await loadJoinedMatch({
      matchId,
      homeAbbr: null,
      guestAbbr: null,
      homeColorOverride: null,
      guestColorOverride: null,
    });
    expect(m).not.toBeNull();
    expect(m!.home.clubId).toBe(42);
    expect(m!.home.abbr).toBe("DRA"); // first 3 of nameShort.toUpperCase
    expect(m!.guest.abbr).toBe("VIS");
    expect(m!.league?.name).toBe("Test Liga");
  });

  it("loadJoinedMatch uses overrides when present", async () => {
    const { matchId } = await seed();
    const m = await loadJoinedMatch({
      matchId,
      homeAbbr: "DGN",
      guestAbbr: "OPP",
      homeColorOverride: "#000000",
      guestColorOverride: "#ffffff",
    });
    expect(m!.home.abbr).toBe("DGN");
    expect(m!.home.color).toBe("#000000");
    expect(m!.guest.abbr).toBe("OPP");
  });

  it("loadJoinedMatch returns null when matchId is null", async () => {
    const m = await loadJoinedMatch({
      matchId: null,
      homeAbbr: null,
      guestAbbr: null,
      homeColorOverride: null,
      guestColorOverride: null,
    });
    expect(m).toBeNull();
  });

  it("loadJoinedMatch returns null when match row is missing", async () => {
    const m = await loadJoinedMatch({
      matchId: 999_999,
      homeAbbr: null,
      guestAbbr: null,
      homeColorOverride: null,
      guestColorOverride: null,
    });
    expect(m).toBeNull();
  });

it("loadJoinedMatch falls back to default colors when teams have none", async () => {
    // Seed teams without badgeColor; ensure DEFAULT_HOME_COLOR / GUEST_COLOR are used.
    await ctx.db.insert(teams).values([
      {
        apiTeamPermanentId: 11,
        seasonTeamId: 11,
        teamCompetitionId: 11,
        name: "Alpha",
        nameShort: "Alpha",
        clubId: 1,
        isOwnClub: false,
      },
      {
        apiTeamPermanentId: 22,
        seasonTeamId: 22,
        teamCompetitionId: 22,
        name: "Beta",
        nameShort: "Beta",
        clubId: 2,
        isOwnClub: false,
      },
    ]);
    const [m] = await ctx.db
      .insert(matches)
      .values({
        apiMatchId: 7777,
        matchNo: 7,
        matchDay: 1,
        kickoffDate: "2026-05-04",
        kickoffTime: "20:00:00",
        leagueId: null,
        homeTeamApiId: 11,
        guestTeamApiId: 22,
      })
      .returning({ id: matches.id });
    const out = await loadJoinedMatch({
      matchId: m!.id,
      homeAbbr: null,
      guestAbbr: null,
      homeColorOverride: null,
      guestColorOverride: null,
    });
    expect(out).not.toBeNull();
    expect(out!.league).toBeNull();
    // Defaults from config.ts.
    expect(out!.home.color).toBe("#1e90ff");
    expect(out!.guest.color).toBe("#dc2626");
  });

  it("setBroadcastLive(false) on a never-started config returns an empty stopped row", async () => {
    // No prior upsert: the config row does not exist yet, so the read after
    // the no-op transaction returns null and the function falls back to a
    // synthesized empty stopped config.
    const out = await setBroadcastLive("ghost", false);
    expect(out.deviceId).toBe("ghost");
    expect(out.isLive).toBe(false);
    expect(out.matchId).toBeNull();
  });

  it("upsert updates color overrides without touching matchId", async () => {
    const { matchId } = await seed();
    const initial = await upsertBroadcastConfig({
      deviceId: "d1",
      matchId,
      homeColorOverride: "#aabbcc",
    });
    expect(initial.homeColorOverride).toBe("#aabbcc");
    const updated = await upsertBroadcastConfig({
      deviceId: "d1",
      guestColorOverride: "#ddeeff",
    });
    expect(updated.guestColorOverride).toBe("#ddeeff");
    expect(updated.homeColorOverride).toBe("#aabbcc"); // preserved
    expect(updated.matchId).toBe(matchId); // preserved
  });
});
