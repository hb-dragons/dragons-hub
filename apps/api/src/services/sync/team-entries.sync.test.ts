import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
vi.mock("../../config/database", () => ({
  getDb: () => new Proxy({}, { get: (_t, p) => (dbHolder.ref as Record<string | symbol, unknown>)[p] }),
}));

import { syncTeamEntriesFromData } from "./team-entries.sync";
import type { LeagueFetchedData } from "./data-fetcher";

let ctx: TestDbContext;
beforeAll(async () => { ctx = await setupTestDb(); dbHolder.ref = ctx.db; });
afterAll(async () => { await closeTestDb(ctx); });
beforeEach(async () => { await resetTestDb(ctx); dbHolder.ref = ctx.db; vi.clearAllMocks(); });

const ref = (teamPermanentId: number, teamname: string, clubId: number) => ({
  teamPermanentId, teamname, teamnameSmall: teamname, seasonTeamId: 1,
  teamCompetitionId: 1, clubId, verzicht: false,
});

function leagueData(overrides: Partial<LeagueFetchedData>): LeagueFetchedData {
  return {
    leagueApiId: 0, leagueDbId: null, leagueName: null, seasonRefId: null,
    seasonStatus: "active", vorabliga: false, spielplan: [], tabelle: [],
    gameDetails: new Map(), ...overrides,
  };
}

async function seedSeason(name: string, status: string): Promise<number> {
  const r = await ctx.client.query<{ id: number }>(
    `INSERT INTO seasons (name, status) VALUES ($1, $2) RETURNING id`, [name, status]);
  return r.rows[0]!.id;
}

async function seedLeague(apiLigaId: number, name: string, seasonId: number, vorabliga = false): Promise<number> {
  const r = await ctx.client.query<{ id: number }>(
    `INSERT INTO leagues (api_liga_id, liga_nr, name, season_id, season_name, season_ref_id, vorabliga, is_tracked)
     VALUES ($1, $1, $2, 2026, 's', $3, $4, true) RETURNING id`,
    [apiLigaId, name, seasonId, vorabliga]);
  return r.rows[0]!.id;
}

async function seedTeam(permanentId: number, name: string, own = true): Promise<number> {
  const r = await ctx.client.query<{ id: number }>(
    `INSERT INTO teams (api_team_permanent_id, season_team_id, team_competition_id, name, club_id, is_own_club)
     VALUES ($1, 1, 1, $2, 100, $3) RETURNING id`,
    [permanentId, name, own]);
  return r.rows[0]!.id;
}

async function seedClubConfig(clubId: number) {
  await ctx.client.query(
    `INSERT INTO app_settings (key, value) VALUES ('club_id', $1)`, [String(clubId)]);
}

describe("syncTeamEntriesFromData", () => {
  it("creates an entry for an own-club squad found in a league's table", async () => {
    await seedClubConfig(100);
    const season = await seedSeason("2026/27", "active");
    const league = await seedLeague(50, "U10", season);
    const squad = await seedTeam(6000, "Dragons U10");

    const res = await syncTeamEntriesFromData([
      leagueData({ leagueApiId: 50, leagueDbId: league, seasonRefId: season, tabelle: [{ team: ref(6000, "Dragons U10", 100) } as never] }),
    ]);

    expect(res.created).toBe(1);
    const rows = await ctx.client.query(`SELECT league_id FROM team_entries WHERE team_id = $1`, [squad]);
    expect(rows.rows).toEqual([{ league_id: league }]);
  });

  it("supersedes a manual link on positive evidence and counts it", async () => {
    await seedClubConfig(100);
    const season = await seedSeason("2026/27", "active");
    const manualLeague = await seedLeague(51, "U10 alt", season);
    const evidenceLeague = await seedLeague(52, "U10 real", season);
    const squad = await seedTeam(6001, "Dragons U10");
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, league_id, link_source)
       VALUES ($1, $2, $3, 'manual')`, [squad, season, manualLeague]);

    const res = await syncTeamEntriesFromData([
      leagueData({ leagueApiId: 52, leagueDbId: evidenceLeague, seasonRefId: season, tabelle: [{ team: ref(6001, "Dragons U10", 100) } as never] }),
    ]);

    expect(res.moved).toBe(1);
    expect(res.supersededManual).toBe(1);
    const rows = await ctx.client.query(`SELECT league_id, link_source FROM team_entries WHERE team_id = $1`, [squad]);
    expect(rows.rows).toEqual([{ league_id: evidenceLeague, link_source: "seeded" }]);
  });

  it("prefers a committed league over a vorabliga when one squad appears in both in the same season and run", async () => {
    await seedClubConfig(100);
    const season = await seedSeason("2026/27", "upcoming");
    const vorab = await seedLeague(53, "U16 Vorab", season, true);
    const committed = await seedLeague(54, "U16 Bezirksliga", season, false);
    const squad = await seedTeam(6002, "Dragons U16");

    await syncTeamEntriesFromData([
      leagueData({ leagueApiId: 54, leagueDbId: committed, seasonRefId: season, vorabliga: false, tabelle: [{ team: ref(6002, "Dragons U16", 100) } as never] }),
      leagueData({ leagueApiId: 53, leagueDbId: vorab, seasonRefId: season, vorabliga: true, tabelle: [{ team: ref(6002, "Dragons U16", 100) } as never] }),
    ]);

    const rows = await ctx.client.query(`SELECT league_id FROM team_entries WHERE team_id = $1`, [squad]);
    expect(rows.rows).toEqual([{ league_id: committed }]);
  });

  it("touches nothing without evidence (a manual gap-filler sticks)", async () => {
    await seedClubConfig(100);
    const season = await seedSeason("2026/27", "active");
    const league = await seedLeague(55, "U10", season);
    const squad = await seedTeam(6003, "Dragons U10");
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, league_id, link_source)
       VALUES ($1, $2, $3, 'manual')`, [squad, season, league]);

    const res = await syncTeamEntriesFromData([
      leagueData({ leagueApiId: 56, leagueDbId: null, seasonRefId: season }),
    ]);

    expect(res.total).toBe(0);
    const rows = await ctx.client.query(`SELECT link_source FROM team_entries WHERE team_id = $1`, [squad]);
    expect(rows.rows).toEqual([{ link_source: "manual" }]);
  });
});
