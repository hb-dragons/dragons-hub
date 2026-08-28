import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
vi.mock("../../config/database", () => ({
  getDb: () => new Proxy({}, { get: (_t, p) => (dbHolder.ref as Record<string | symbol, unknown>)[p] }),
}));

import { syncTeamEntriesFromData } from "./team-entries.sync";
import type { LeagueFetchedData } from "./data-fetcher";
import type { SyncLogger } from "./sync-logger";

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

function fakeLogger(): { logger: SyncLogger; entries: { entityId: string; action: string; message?: string }[] } {
  const entries: { entityId: string; action: string; message?: string }[] = [];
  const logger = { log: async (e: { entityId: string; action: string; message?: string }) => { entries.push(e); } };
  return { logger: logger as unknown as SyncLogger, entries };
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
  it("prefers the committed league when the vorabliga is supplied first", async () => {
    await seedClubConfig(100);
    const season = await seedSeason("2026/27", "upcoming");
    const vorab = await seedLeague(63, "U16 Vorab", season, true);
    const committed = await seedLeague(64, "U16 Bezirksliga", season, false);
    const squad = await seedTeam(6010, "Dragons U16");

    const { logger, entries } = fakeLogger();
    const res = await syncTeamEntriesFromData([
      leagueData({ leagueApiId: 63, leagueDbId: vorab, seasonRefId: season, vorabliga: true, tabelle: [{ team: ref(6010, "Dragons U16", 100) } as never] }),
      leagueData({ leagueApiId: 64, leagueDbId: committed, seasonRefId: season, vorabliga: false, tabelle: [{ team: ref(6010, "Dragons U16", 100) } as never] }),
    ], logger);

    expect(res.conflicts).toBe(0);
    expect(entries).toEqual([]);
    const rows = await ctx.client.query(`SELECT league_id FROM team_entries WHERE team_id = $1`, [squad]);
    expect(rows.rows).toEqual([{ league_id: committed }]);
  });

  it("keeps the existing link and logs a conflict when a squad appears in two committed leagues", async () => {
    await seedClubConfig(100);
    const season = await seedSeason("2026/27", "active");
    const linked = await seedLeague(65, "U14 Kreisliga", season);
    const otherA = await seedLeague(66, "U14 Bezirksliga", season);
    const otherB = await seedLeague(67, "U14 Pokal", season);
    const squad = await seedTeam(6011, "Dragons U14");
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, league_id, link_source)
       VALUES ($1, $2, $3, 'manual')`, [squad, season, linked]);

    const { logger, entries } = fakeLogger();
    const res = await syncTeamEntriesFromData([
      leagueData({ leagueApiId: 66, leagueDbId: otherA, seasonRefId: season, tabelle: [{ team: ref(6011, "Dragons U14", 100) } as never] }),
      leagueData({ leagueApiId: 67, leagueDbId: otherB, seasonRefId: season, tabelle: [{ team: ref(6011, "Dragons U14", 100) } as never] }),
    ], logger);

    expect(res.conflicts).toBe(1);
    expect(res.kept).toBe(1);
    expect(res.moved).toBe(0);
    expect(res.supersededManual).toBe(0);
    const rows = await ctx.client.query(`SELECT league_id, link_source FROM team_entries WHERE team_id = $1`, [squad]);
    expect(rows.rows).toEqual([{ league_id: linked, link_source: "manual" }]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.action).toBe("skipped");
    expect(entries[0]!.entityId).toBe("6011");
    expect(entries[0]!.message).toContain("66");
    expect(entries[0]!.message).toContain("67");
  });

  it("resolves a conflict for a squad with no entry to the same league whatever the input order", async () => {
    await seedClubConfig(100);
    const season = await seedSeason("2026/27", "active");
    const first = await seedLeague(68, "U12 A", season);
    const second = await seedLeague(69, "U12 B", season);
    const squad = await seedTeam(6012, "Dragons U12");
    const inOrder = [
      leagueData({ leagueApiId: 68, leagueDbId: first, seasonRefId: season, tabelle: [{ team: ref(6012, "Dragons U12", 100) } as never] }),
      leagueData({ leagueApiId: 69, leagueDbId: second, seasonRefId: season, tabelle: [{ team: ref(6012, "Dragons U12", 100) } as never] }),
    ];

    const { logger, entries } = fakeLogger();
    const res = await syncTeamEntriesFromData([...inOrder].reverse(), logger);

    expect(res.created).toBe(1);
    expect(res.conflicts).toBe(1);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.message).toContain("no entry existed");
    const rows = await ctx.client.query(`SELECT league_id FROM team_entries WHERE team_id = $1`, [squad]);
    expect(rows.rows).toEqual([{ league_id: first }]);
  });

  it("treats two vorabligas as a conflict", async () => {
    await seedClubConfig(100);
    const season = await seedSeason("2026/27", "upcoming");
    const vorabA = await seedLeague(70, "U18 Vorab A", season, true);
    const vorabB = await seedLeague(71, "U18 Vorab B", season, true);
    const squad = await seedTeam(6013, "Dragons U18");

    const { logger, entries } = fakeLogger();
    const res = await syncTeamEntriesFromData([
      leagueData({ leagueApiId: 70, leagueDbId: vorabA, seasonRefId: season, vorabliga: true, tabelle: [{ team: ref(6013, "Dragons U18", 100) } as never] }),
      leagueData({ leagueApiId: 71, leagueDbId: vorabB, seasonRefId: season, vorabliga: true, tabelle: [{ team: ref(6013, "Dragons U18", 100) } as never] }),
    ], logger);

    expect(res.conflicts).toBe(1);
    expect(entries).toHaveLength(1);
    const rows = await ctx.client.query(`SELECT league_id FROM team_entries WHERE team_id = $1`, [squad]);
    expect(rows.rows).toEqual([{ league_id: vorabA }]);
  });
  it("connects an unlinked entry despite conflicting evidence, and logs the conflict", async () => {
    await seedClubConfig(100);
    const season = await seedSeason("2026/27", "active");
    const a = await seedLeague(72, "U12 A", season);
    const b = await seedLeague(73, "U12 B", season);
    const squad = await seedTeam(6014, "Dragons U12");
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, league_id, link_source)
       VALUES ($1, $2, NULL, 'manual')`, [squad, season]);

    const { logger, entries } = fakeLogger();
    const res = await syncTeamEntriesFromData([
      leagueData({ leagueApiId: 72, leagueDbId: a, seasonRefId: season, tabelle: [{ team: ref(6014, "Dragons U12", 100) } as never] }),
      leagueData({ leagueApiId: 73, leagueDbId: b, seasonRefId: season, tabelle: [{ team: ref(6014, "Dragons U12", 100) } as never] }),
    ], logger);

    expect(res.conflicts).toBe(1);
    expect(res.moved).toBe(1);
    // the conflict, plus the manual-supersession entry the move earns
    expect(entries.map((e) => e.action)).toEqual(["skipped", "updated"]);
    const rows = await ctx.client.query(`SELECT league_id FROM team_entries WHERE team_id = $1`, [squad]);
    expect(rows.rows).toEqual([{ league_id: a }]);
  });

  it("does not claim a missing entry when conflicting evidence matches the existing link", async () => {
    await seedClubConfig(100);
    const season = await seedSeason("2026/27", "active");
    const a = await seedLeague(74, "U8 A", season);
    const b = await seedLeague(75, "U8 B", season);
    const squad = await seedTeam(6015, "Dragons U8");
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, league_id, link_source)
       VALUES ($1, $2, $3, 'seeded')`, [squad, season, a]);

    const { logger, entries } = fakeLogger();
    const res = await syncTeamEntriesFromData([
      leagueData({ leagueApiId: 74, leagueDbId: a, seasonRefId: season, tabelle: [{ team: ref(6015, "Dragons U8", 100) } as never] }),
      leagueData({ leagueApiId: 75, leagueDbId: b, seasonRefId: season, tabelle: [{ team: ref(6015, "Dragons U8", 100) } as never] }),
    ], logger);

    expect(res.conflicts).toBe(1);
    expect(res.unchanged).toBe(1);
    expect(res.total).toBe(res.created + res.moved + res.unchanged + res.kept);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.message).not.toContain("no entry existed");
  });

  it("breaks a conflict on the federation liga id, not the local row id", async () => {
    await seedClubConfig(100);
    const season = await seedSeason("2026/27", "active");
    // Higher federation id inserted first, so the local row ids run the other way.
    const higherLiga = await seedLeague(77, "U20 B", season);
    const lowerLiga = await seedLeague(76, "U20 A", season);
    const squad = await seedTeam(6016, "Dragons U20");

    const { logger } = fakeLogger();
    const res = await syncTeamEntriesFromData([
      leagueData({ leagueApiId: 77, leagueDbId: higherLiga, seasonRefId: season, tabelle: [{ team: ref(6016, "Dragons U20", 100) } as never] }),
      leagueData({ leagueApiId: 76, leagueDbId: lowerLiga, seasonRefId: season, tabelle: [{ team: ref(6016, "Dragons U20", 100) } as never] }),
    ], logger);

    expect(res.conflicts).toBe(1);
    const rows = await ctx.client.query(`SELECT league_id FROM team_entries WHERE team_id = $1`, [squad]);
    expect(rows.rows).toEqual([{ league_id: lowerLiga }]);
  });
});
