import { describe, expect, it, vi, beforeAll, beforeEach, afterAll, afterEach } from "vitest";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

vi.mock("../../config/logger", () => ({
  logger: {
    child: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() })),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

import {
  getBufferConfig,
  listHallOccupancy,
  loadHomeGameDays,
  loadOurHalls,
} from "./hall-occupancy.service";
import { invalidateActiveSeasonCache } from "../admin/season.service";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";

let ctx: TestDbContext;
let seasonId: number;
let leagueId: number;
let nextApiId = 1;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  vi.stubEnv("TZ", "America/New_York");
  await resetTestDb(ctx);
  invalidateActiveSeasonCache();
  nextApiId = 1;
  const season = await ctx.client.query<{ id: number }>(
    `INSERT INTO seasons (name, status) VALUES ('2025/26', 'active') RETURNING id`,
  );
  seasonId = season.rows[0]!.id;
  const league = await ctx.client.query<{ id: number }>(
    `INSERT INTO leagues (api_liga_id, liga_nr, name, season_id, season_name, season_ref_id)
     VALUES (100, 1, 'Oberliga', 2025, '2025/26', $1) RETURNING id`,
    [seasonId],
  );
  leagueId = league.rows[0]!.id;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

async function insert(table: string, data: Record<string, unknown>): Promise<number> {
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const res = await ctx.client.query<{ id: number }>(
    `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${vals.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`,
    vals,
  );
  return res.rows[0]!.id;
}

async function team(apiId: number, name: string, isOwnClub: boolean) {
  return insert("teams", {
    api_team_permanent_id: apiId,
    season_team_id: apiId,
    team_competition_id: 1,
    name,
    club_id: isOwnClub ? 4121 : 9000 + apiId,
    is_own_club: isOwnClub,
  });
}

async function venue(name: string): Promise<number> {
  return insert("venues", { api_id: 500 + nextApiId++, name, city: "Berlin" });
}

async function hallTime(venueId: number, date: string, start: string, end: string) {
  await insert("venue_hall_times", {
    venue_id: venueId,
    date,
    kind: "open",
    start_time: start,
    end_time: end,
    source: "manual",
  });
}

async function match(overrides: Record<string, unknown>): Promise<number> {
  return insert("matches", {
    api_match_id: 9000 + nextApiId++,
    match_no: 1,
    match_day: 1,
    kickoff_date: "2025-03-15",
    kickoff_time: "10:00:00",
    league_id: leagueId,
    home_team_api_id: 1000,
    guest_team_api_id: 2000,
    ...overrides,
  });
}

async function seedBase() {
  await team(1000, "Dragons Herren 1", true);
  await team(2000, "Gast BC", false);
  return venue("Sporthalle Am Park");
}

const range = { from: "2025-03-01", to: "2025-03-31" };

describe("loadHomeGameDays", () => {
  it("groups two games of one venue and day, window with buffers, covered", async () => {
    const v = await seedBase();
    await hallTime(v, "2025-03-15", "08:00:00", "17:00:00");
    const late = await match({ venue_id: v, kickoff_time: "13:00:00" });
    const early = await match({ venue_id: v, kickoff_time: "10:00:00" });

    const days = await loadHomeGameDays(range);

    expect(days).toHaveLength(1);
    const day = days[0]!;
    expect(day.venueId).toBe(v);
    expect(day.venueName).toBe("Sporthalle Am Park");
    expect(day.date).toBe("2025-03-15");
    expect(day.windowStart).toBe("09:00:00");
    expect(day.windowEnd).toBe("15:30:00");
    expect(day.coverage).toBe("covered");
    expect(day.hallTime).toEqual({
      kind: "open",
      startTime: "08:00",
      endTime: "17:00",
      note: null,
    });
    expect(day.games.map((g) => g.matchId)).toEqual([early, late]);
    expect(day.games[0]).toMatchObject({
      kickoffTime: "10:00:00",
      endTime: "11:30:00",
      homeTeam: "Dragons Herren 1",
      guestTeam: "Gast BC",
      leagueName: "Oberliga",
    });
  });

  it("uses the team entry game duration", async () => {
    const v = await seedBase();
    const teamId = await team(1001, "Dragons U16", true);
    await insert("team_entries", { team_id: teamId, season_id: seasonId, estimated_game_duration: 120 });
    await hallTime(v, "2025-03-15", "08:00:00", "17:00:00");
    await match({ venue_id: v, home_team_api_id: 1001 });

    const [day] = await loadHomeGameDays(range);

    expect(day!.games[0]!.endTime).toBe("12:00:00");
    expect(day!.windowEnd).toBe("13:00:00");
  });

  it("reports partial coverage with gaps", async () => {
    const v = await seedBase();
    await hallTime(v, "2025-03-15", "10:00:00", "15:00:00");
    await match({ venue_id: v, kickoff_time: "10:00:00" });
    await match({ venue_id: v, kickoff_time: "13:00:00" });

    const [day] = await loadHomeGameDays(range);

    expect(day!.coverage).toBe("partial");
    expect(day!.gapBeforeMinutes).toBe(60);
    expect(day!.gapAfterMinutes).toBe(30);
  });

  it("reports none with a null hall time when our hall has no row that day", async () => {
    const v = await seedBase();
    await hallTime(v, "2025-03-22", "08:00:00", "17:00:00");
    await match({ venue_id: v });

    const [day] = await loadHomeGameDays(range);

    expect(day!.coverage).toBe("none");
    expect(day!.hallTime).toBeNull();
  });

  it("skips venues with no hall-time rows at all", async () => {
    const v = await seedBase();
    await match({ venue_id: v });

    expect(await loadHomeGameDays(range)).toEqual([]);
  });

  it("excludes cancelled, forfeited, away and other-club games", async () => {
    const v = await seedBase();
    await team(3000, "Fremd BC", false);
    await hallTime(v, "2025-03-15", "08:00:00", "17:00:00");
    await match({ venue_id: v, is_cancelled: true });
    await match({ venue_id: v, is_forfeited: true });
    await match({ venue_id: v, home_team_api_id: 2000, guest_team_api_id: 1000 });
    await match({ venue_id: v, home_team_api_id: 3000, guest_team_api_id: 2000 });
    const live = await match({ venue_id: v, kickoff_time: "15:00:00" });

    const days = await loadHomeGameDays(range);

    expect(days).toHaveLength(1);
    expect(days[0]!.games.map((g) => g.matchId)).toEqual([live]);
  });

  it("lists a game with a moved kickoff under its effective day only", async () => {
    const v = await seedBase();
    await hallTime(v, "2025-03-15", "08:00:00", "17:00:00");
    await hallTime(v, "2025-03-22", "08:00:00", "17:00:00");
    // matches.kickoff_date carries the effective (overridden) day.
    const moved = await match({ venue_id: v, kickoff_date: "2025-03-22" });

    const days = await loadHomeGameDays(range);

    expect(days.map((d) => d.date)).toEqual(["2025-03-22"]);
    expect(days[0]!.games.map((g) => g.matchId)).toEqual([moved]);
  });

  it("matchIds scope returns the whole day, not only the asked games", async () => {
    const v = await seedBase();
    await hallTime(v, "2025-03-15", "08:00:00", "17:00:00");
    const asked = await match({ venue_id: v, kickoff_time: "10:00:00" });
    const other = await match({ venue_id: v, kickoff_time: "13:00:00" });
    await match({ venue_id: v, kickoff_date: "2025-03-22" });

    const days = await loadHomeGameDays({ matchIds: [asked] });

    expect(days).toHaveLength(1);
    expect(days[0]!.games.map((g) => g.matchId)).toEqual([asked, other]);
  });

  it("matchIds scope with no ids returns nothing", async () => {
    await seedBase();
    expect(await loadHomeGameDays({ matchIds: [] })).toEqual([]);
  });

  it("filters by venueIds and orders by date then venue name", async () => {
    const b = await seedBase();
    const a = await venue("Aula Alt");
    await hallTime(b, "2025-03-15", "08:00:00", "17:00:00");
    await hallTime(a, "2025-03-15", "08:00:00", "17:00:00");
    await hallTime(b, "2025-03-08", "08:00:00", "17:00:00");
    await match({ venue_id: b });
    await match({ venue_id: a });
    await match({ venue_id: b, kickoff_date: "2025-03-08" });

    const all = await loadHomeGameDays(range);
    expect(all.map((d) => `${d.date} ${d.venueName}`)).toEqual([
      "2025-03-08 Sporthalle Am Park",
      "2025-03-15 Aula Alt",
      "2025-03-15 Sporthalle Am Park",
    ]);

    const only = await loadHomeGameDays({ ...range, venueIds: [a] });
    expect(only.map((d) => d.venueId)).toEqual([a]);
  });
});

describe("loadOurHalls", () => {
  it("returns distinct venues with hall-time rows ordered by name", async () => {
    const b = await venue("Zeta Halle");
    const a = await venue("Alpha Halle");
    await venue("Ohne Zeiten");
    await hallTime(b, "2025-03-15", "08:00:00", "17:00:00");
    await hallTime(b, "2025-03-16", "08:00:00", "17:00:00");
    await hallTime(a, "2025-03-15", "08:00:00", "17:00:00");

    expect(await loadOurHalls()).toEqual([
      { venueId: a, venueName: "Alpha Halle" },
      { venueId: b, venueName: "Zeta Halle" },
    ]);
  });
});

describe("getBufferConfig", () => {
  it("defaults and reads settings", async () => {
    expect(await getBufferConfig()).toEqual({
      bufferBeforeMinutes: 60,
      bufferAfterMinutes: 60,
      defaultGameDurationMinutes: 90,
    });
    await ctx.client.query(
      "INSERT INTO app_settings (key, value) VALUES ('venue_booking_buffer_before', '30')",
    );
    expect((await getBufferConfig()).bufferBeforeMinutes).toBe(30);
  });
});

describe("listHallOccupancy", () => {
  it("filters by coverage after computing", async () => {
    const v = await seedBase();
    await hallTime(v, "2025-03-15", "08:00:00", "17:00:00");
    await match({ venue_id: v });
    await match({ venue_id: v, kickoff_date: "2025-03-22" });

    const all = await listHallOccupancy({ dateFrom: "2025-03-01", dateTo: "2025-03-31" });
    expect(all.map((d) => d.coverage)).toEqual(["covered", "none"]);

    const none = await listHallOccupancy({
      dateFrom: "2025-03-01",
      dateTo: "2025-03-31",
      coverage: "none",
    });
    expect(none.map((d) => d.date)).toEqual(["2025-03-22"]);
  });

  it("defaults to today through the active season end", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2025-03-10T12:00:00Z"));
    await ctx.client.query("UPDATE seasons SET end_date = '2025-06-30' WHERE id = $1", [seasonId]);
    invalidateActiveSeasonCache();
    const v = await seedBase();
    await hallTime(v, "2025-03-05", "08:00:00", "17:00:00");
    await hallTime(v, "2025-06-30", "08:00:00", "17:00:00");
    await hallTime(v, "2025-07-01", "08:00:00", "17:00:00");
    await match({ venue_id: v, kickoff_date: "2025-03-05" });
    await match({ venue_id: v, kickoff_date: "2025-06-30" });
    await match({ venue_id: v, kickoff_date: "2025-07-01" });

    const days = await listHallOccupancy({});

    expect(days.map((d) => d.date)).toEqual(["2025-06-30"]);
  });

  it("falls back to 365 days when the season has no end date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2025-03-10T12:00:00Z"));
    const v = await seedBase();
    await hallTime(v, "2026-03-10", "08:00:00", "17:00:00");
    await hallTime(v, "2026-03-11", "08:00:00", "17:00:00");
    await match({ venue_id: v, kickoff_date: "2026-03-10" });
    await match({ venue_id: v, kickoff_date: "2026-03-11" });

    const days = await listHallOccupancy({});

    expect(days.map((d) => d.date)).toEqual(["2026-03-10"]);
  });

  it("falls back to 365 days when the season end lies before the start date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2025-08-10T12:00:00Z"));
    await ctx.client.query("UPDATE seasons SET end_date = '2025-06-30' WHERE id = $1", [seasonId]);
    invalidateActiveSeasonCache();
    const v = await seedBase();
    await hallTime(v, "2025-09-06", "08:00:00", "17:00:00");
    await match({ venue_id: v, kickoff_date: "2025-09-06" });

    const days = await listHallOccupancy({});

    expect(days.map((d) => d.date)).toEqual(["2025-09-06"]);
  });

  it("falls back to 365 days when there is no active season", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2025-03-10T12:00:00Z"));
    await ctx.client.query("UPDATE seasons SET status = 'archived'");
    invalidateActiveSeasonCache();
    const v = await seedBase();
    await hallTime(v, "2025-03-15", "08:00:00", "17:00:00");
    await match({ venue_id: v });

    expect(await listHallOccupancy({})).toHaveLength(1);
  });

  it("passes venueId through", async () => {
    const v = await seedBase();
    const w = await venue("Andere Halle");
    await hallTime(v, "2025-03-15", "08:00:00", "17:00:00");
    await hallTime(w, "2025-03-15", "08:00:00", "17:00:00");
    await match({ venue_id: v });
    await match({ venue_id: w });

    const days = await listHallOccupancy({ dateFrom: "2025-03-01", dateTo: "2025-03-31", venueId: w });
    expect(days.map((d) => d.venueId)).toEqual([w]);
  });
});
