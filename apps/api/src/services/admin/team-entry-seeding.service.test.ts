import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));
vi.mock("../../config/database", () => ({
  getDb: () => new Proxy({}, { get: (_t, p) => (dbHolder.ref as Record<string | symbol, unknown>)[p] }),
}));
vi.mock("./league-roster", () => ({ fetchLeagueRoster: vi.fn() }));

import { fetchLeagueRoster } from "./league-roster";
import { seedSeasonTeamEntries } from "./team-entry-seeding.service";

let ctx: TestDbContext;
beforeAll(async () => { ctx = await setupTestDb(); dbHolder.ref = ctx.db; });
afterAll(async () => { await closeTestDb(ctx); });
beforeEach(async () => { await resetTestDb(ctx); vi.clearAllMocks(); });

const ref = (teamPermanentId: number, teamname: string, clubId: number) => ({
  teamPermanentId, teamname, teamnameSmall: teamname, seasonTeamId: 7,
  teamCompetitionId: 8, clubId, verzicht: false,
});

async function seedSeason(name: string, status: string, startDate: string | null = null): Promise<number> {
  const r = await ctx.client.query<{ id: number }>(
    `INSERT INTO seasons (name, status, start_date) VALUES ($1, $2, $3) RETURNING id`, [name, status, startDate]);
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

describe("seedSeasonTeamEntries", () => {
  it("creates squad rows and entries for own-club teams found in the roster, defaulting display_order to MAX+1", async () => {
    await seedClubConfig(100);
    const season = await seedSeason("2026/27", "upcoming");
    const league = await seedLeague(30, "U10 Kreisliga", season);
    // A pre-existing entry in this season with no relation to the new squad,
    // so the MAX(display_order)+1 fallback is exercised against a real value
    // rather than defaulting from an empty table (which would trivially pass
    // even with broken arithmetic).
    const otherSquad = await seedTeam(8999, "Dragons U8");
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, league_id, display_order) VALUES ($1, $2, $3, 2)`,
      [otherSquad, season, league]);
    vi.mocked(fetchLeagueRoster).mockResolvedValue([ref(9000, "Dragons U10", 100), ref(9001, "Rivals", 200)]);

    const result = await seedSeasonTeamEntries(season, [30]);

    expect(result).toEqual({ entriesSeeded: 1, rosterFailures: [] });
    const entries = await ctx.client.query<{ league_id: number; link_source: string; display_order: number }>(
      `SELECT te.league_id, te.link_source, te.display_order FROM team_entries te
       JOIN teams t ON t.id = te.team_id WHERE t.api_team_permanent_id = 9000`);
    expect(entries.rows).toEqual([{ league_id: league, link_source: "seeded", display_order: 3 }]);
    // The brand-new squad row exists and is own-club:
    const squad = await ctx.client.query<{ is_own_club: boolean }>(
      `SELECT is_own_club FROM teams WHERE api_team_permanent_id = 9000`);
    expect(squad.rows[0]!.is_own_club).toBe(true);
  });

  it("carries forward color/duration/order from the squad's latest previous entry, not the name", async () => {
    await seedClubConfig(100);
    const old = await seedSeason("2025/26", "active");
    const next = await seedSeason("2026/27", "upcoming");
    const oldLeague = await seedLeague(31, "U14", old);
    const newLeague = await seedLeague(32, "U16", next);
    const squad = await seedTeam(9100, "Dragons U16");
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, league_id, custom_name, badge_color, estimated_game_duration, display_order)
       VALUES ($1, $2, $3, 'U14', 'red', 80, 4)`, [squad, old, oldLeague]);
    vi.mocked(fetchLeagueRoster).mockResolvedValue([ref(9100, "Dragons U16", 100)]);

    await seedSeasonTeamEntries(next, [32]);

    const entry = await ctx.client.query<{ custom_name: string | null; badge_color: string | null; estimated_game_duration: number | null; display_order: number; league_id: number }>(
      `SELECT custom_name, badge_color, estimated_game_duration, display_order, league_id
       FROM team_entries WHERE team_id = $1 AND season_id = $2`, [squad, next]);
    expect(entry.rows[0]).toEqual({
      custom_name: null, badge_color: "red", estimated_game_duration: 80, display_order: 4, league_id: newLeague,
    });
  });

  it("carries forward from the chronologically later of two dated previous seasons", async () => {
    await seedClubConfig(100);
    const older = await seedSeason("2024/25", "archived", "2024-09-01");
    const newer = await seedSeason("2025/26", "active", "2025-09-01");
    const next = await seedSeason("2026/27", "upcoming");
    const olderLeague = await seedLeague(40, "U14 old", older);
    const newerLeague = await seedLeague(41, "U14 newer", newer);
    const nextLeague = await seedLeague(42, "U16", next);
    const squad = await seedTeam(9500, "Dragons U16");
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, league_id, badge_color, estimated_game_duration, display_order)
       VALUES ($1, $2, $3, 'blue', 70, 1)`, [squad, older, olderLeague]);
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, league_id, badge_color, estimated_game_duration, display_order)
       VALUES ($1, $2, $3, 'green', 90, 2)`, [squad, newer, newerLeague]);
    vi.mocked(fetchLeagueRoster).mockResolvedValue([ref(9500, "Dragons U16", 100)]);

    await seedSeasonTeamEntries(next, [42]);

    const entry = await ctx.client.query<{ badge_color: string; estimated_game_duration: number; league_id: number }>(
      `SELECT badge_color, estimated_game_duration, league_id FROM team_entries WHERE team_id = $1 AND season_id = $2`,
      [squad, next]);
    expect(entry.rows[0]).toEqual({ badge_color: "green", estimated_game_duration: 90, league_id: nextLeague });
  });

  it("does not let an undated previous season outrank a dated one", async () => {
    await seedClubConfig(100);
    const dated = await seedSeason("2025/26", "active", "2025-09-01");
    // Undated season created AFTER the dated one, so a naive createdAt-only
    // sort (or SQL `ORDER BY start_date DESC`, which is NULLS FIRST) would
    // wrongly pick this one.
    const undated = await seedSeason("2025/26 friendlies", "archived", null);
    const next = await seedSeason("2026/27", "upcoming");
    const datedLeague = await seedLeague(43, "U14 dated", dated);
    const undatedLeague = await seedLeague(44, "U14 undated", undated);
    const nextLeague = await seedLeague(45, "U16", next);
    const squad = await seedTeam(9600, "Dragons U16");
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, league_id, badge_color, estimated_game_duration, display_order)
       VALUES ($1, $2, $3, 'blue', 70, 1)`, [squad, dated, datedLeague]);
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, league_id, badge_color, estimated_game_duration, display_order)
       VALUES ($1, $2, $3, 'green', 90, 2)`, [squad, undated, undatedLeague]);
    vi.mocked(fetchLeagueRoster).mockResolvedValue([ref(9600, "Dragons U16", 100)]);

    await seedSeasonTeamEntries(next, [45]);

    const entry = await ctx.client.query<{ badge_color: string; estimated_game_duration: number; league_id: number }>(
      `SELECT badge_color, estimated_game_duration, league_id FROM team_entries WHERE team_id = $1 AND season_id = $2`,
      [squad, next]);
    expect(entry.rows[0]).toEqual({ badge_color: "blue", estimated_game_duration: 70, league_id: nextLeague });
  });

  it("does not clobber an existing entry's fields, only refreshes the seeded link", async () => {
    await seedClubConfig(100);
    const season = await seedSeason("2026/27", "upcoming");
    const a = await seedLeague(33, "U16 Vorab", season, true);
    const b = await seedLeague(34, "U16 Bezirksliga", season);
    const squad = await seedTeam(9200, "Dragons U16");
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, league_id, custom_name, link_source)
       VALUES ($1, $2, $3, 'Sechzehn', 'seeded')`, [squad, season, a]);
    vi.mocked(fetchLeagueRoster).mockResolvedValue([ref(9200, "Dragons U16", 100)]);

    await seedSeasonTeamEntries(season, [34]);

    const entry = await ctx.client.query<{ league_id: number; custom_name: string }>(
      `SELECT league_id, custom_name FROM team_entries WHERE team_id = $1 AND season_id = $2`, [squad, season]);
    expect(entry.rows[0]).toEqual({ league_id: b, custom_name: "Sechzehn" });
  });

  it("reports roster failures per league and keeps going", async () => {
    await seedClubConfig(100);
    const season = await seedSeason("2026/27", "upcoming");
    await seedLeague(35, "U12 A", season);
    const okLeague = await seedLeague(36, "U12 B", season);
    vi.mocked(fetchLeagueRoster)
      .mockRejectedValueOnce(new Error("federation down"))
      .mockResolvedValueOnce([ref(9300, "Dragons U12", 100)]);

    const result = await seedSeasonTeamEntries(season, [35, 36]);

    expect(result.rosterFailures).toEqual([35]);
    expect(result.entriesSeeded).toBe(1);
    const entries = await ctx.client.query(`SELECT id FROM team_entries WHERE league_id = $1`, [okLeague]);
    expect(entries.rows).toHaveLength(1);
  });

  it("reports entriesSeeded: 0 and leaves the row untouched when re-seeding an already-correct entry", async () => {
    await seedClubConfig(100);
    const season = await seedSeason("2026/27", "upcoming");
    const league = await seedLeague(37, "U18", season);
    vi.mocked(fetchLeagueRoster).mockResolvedValue([ref(9400, "Dragons U18", 100)]);

    const first = await seedSeasonTeamEntries(season, [37]);
    expect(first.entriesSeeded).toBe(1);
    const before = await ctx.client.query<{ id: number; updated_at: string }>(
      `SELECT te.id, te.updated_at FROM team_entries te
       JOIN teams t ON t.id = te.team_id WHERE t.api_team_permanent_id = 9400`);
    expect(before.rows).toHaveLength(1);

    const second = await seedSeasonTeamEntries(season, [37]);
    expect(second).toEqual({ entriesSeeded: 0, rosterFailures: [] });

    const after = await ctx.client.query<{ id: number; updated_at: string; league_id: number }>(
      `SELECT te.id, te.updated_at, te.league_id FROM team_entries te
       JOIN teams t ON t.id = te.team_id WHERE t.api_team_permanent_id = 9400`);
    // Same row, same league, no re-touch — the "unchanged" branch never
    // reaches the UPDATE, so updatedAt does not move.
    expect(after.rows).toHaveLength(1);
    expect(after.rows[0]!.id).toBe(before.rows[0]!.id);
    expect(after.rows[0]!.league_id).toBe(league);
    expect(after.rows[0]!.updated_at).toEqual(before.rows[0]!.updated_at);
  });

  it("does nothing when no club is configured, without asking the federation", async () => {
    const season = await seedSeason("2026/27", "upcoming");
    await seedLeague(38, "U10", season);

    const result = await seedSeasonTeamEntries(season, [38]);

    expect(result).toEqual({ entriesSeeded: 0, rosterFailures: [] });
    expect(fetchLeagueRoster).not.toHaveBeenCalled();
    expect((await ctx.client.query(`SELECT id FROM team_entries`)).rows).toEqual([]);
  });

  it("does nothing for an empty league list", async () => {
    await seedClubConfig(100);
    const season = await seedSeason("2026/27", "upcoming");

    expect(await seedSeasonTeamEntries(season, [])).toEqual({ entriesSeeded: 0, rosterFailures: [] });
    expect(fetchLeagueRoster).not.toHaveBeenCalled();
  });

  it("skips a liga id the season has no league row for, even if another season has it", async () => {
    await seedClubConfig(100);
    const season = await seedSeason("2026/27", "upcoming");
    const lastSeason = await seedSeason("2025/26", "active");
    await seedLeague(39, "U10 last year", lastSeason);

    const result = await seedSeasonTeamEntries(season, [39]);

    expect(result).toEqual({ entriesSeeded: 0, rosterFailures: [] });
    expect(fetchLeagueRoster).not.toHaveBeenCalled();
  });
});

describe("staff carry-forward", () => {
  async function seedStaff(
    entryId: number,
    values: {
      firstName: string;
      lastName: string;
      role: string;
      phone?: string | null;
      email?: string | null;
      licence?: string | null;
      photoFilename?: string | null;
      refereeContact?: boolean;
    },
  ): Promise<number> {
    const person = await ctx.client.query<{ id: number }>(
      `INSERT INTO staff_people (first_name, last_name, phone, email, licence, photo_filename)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        values.firstName,
        values.lastName,
        values.phone ?? null,
        values.email ?? null,
        values.licence ?? null,
        values.photoFilename ?? null,
      ],
    );
    await ctx.client.query(
      `INSERT INTO team_staff (team_entry_id, person_id, role, referee_contact)
       VALUES ($1, $2, $3, $4)`,
      [entryId, person.rows[0]!.id, values.role, values.refereeContact ?? false],
    );
    return person.rows[0]!.id;
  }

  interface StaffRow {
    team_entry_id: number;
    person_id: number;
    first_name: string;
    last_name: string;
    role: string;
    phone: string | null;
    email: string | null;
    licence: string | null;
    photo_filename: string | null;
    referee_contact: boolean;
  }

  function staffOfEntry(entryId: number) {
    return ctx.client.query<StaffRow>(
      `SELECT ts.team_entry_id, ts.person_id, p.first_name, p.last_name, ts.role,
              p.phone, p.email, p.licence, p.photo_filename, ts.referee_contact
       FROM team_staff ts JOIN staff_people p ON p.id = ts.person_id
       WHERE ts.team_entry_id = $1 ORDER BY p.last_name`,
      [entryId],
    );
  }

  async function entryIdOf(squad: number, season: number): Promise<number> {
    const r = await ctx.client.query<{ id: number }>(
      `SELECT id FROM team_entries WHERE team_id = $1 AND season_id = $2`,
      [squad, season],
    );
    return r.rows[0]!.id;
  }

  it("copies the previous entry's staff onto the new season's entry", async () => {
    await seedClubConfig(100);
    const old = await seedSeason("2025/26", "active", "2025-09-01");
    const next = await seedSeason("2026/27", "upcoming", "2026-09-01");
    const oldLeague = await seedLeague(50, "U14", old);
    await seedLeague(51, "U16", next);
    const squad = await seedTeam(9700, "Dragons U16");
    const oldEntry = await ctx.client.query<{ id: number }>(
      `INSERT INTO team_entries (team_id, season_id, league_id, custom_name, badge_color)
       VALUES ($1, $2, $3, 'U14', 'red') RETURNING id`,
      [squad, old, oldLeague],
    );
    const oldEntryId = oldEntry.rows[0]!.id;
    const adaPersonId = await seedStaff(oldEntryId, {
      firstName: "Ada",
      lastName: "Lovelace",
      role: "trainer",
      phone: "+49 170 1234567",
      email: "ada@example.de",
      licence: "C-Lizenz",
      photoFilename: "staff/ada.jpg",
      refereeContact: true,
    });
    const benPersonId = await seedStaff(oldEntryId, {
      firstName: "Ben",
      lastName: "Byron",
      role: "co_trainer",
    });
    vi.mocked(fetchLeagueRoster).mockResolvedValue([ref(9700, "Dragons U16", 100)]);

    await seedSeasonTeamEntries(next, [51]);

    const newEntryId = await entryIdOf(squad, next);
    const staff = await staffOfEntry(newEntryId);
    expect(staff.rows).toEqual([
      {
        team_entry_id: newEntryId,
        person_id: benPersonId,
        first_name: "Ben",
        last_name: "Byron",
        role: "co_trainer",
        phone: null,
        email: null,
        licence: null,
        photo_filename: null,
        referee_contact: false,
      },
      {
        team_entry_id: newEntryId,
        person_id: adaPersonId,
        first_name: "Ada",
        last_name: "Lovelace",
        role: "trainer",
        phone: "+49 170 1234567",
        email: "ada@example.de",
        licence: "C-Lizenz",
        photo_filename: "staff/ada.jpg",
        referee_contact: true,
      },
    ]);
    // The originals stay where they were — this is a copy, not a move.
    expect((await staffOfEntry(oldEntryId)).rows).toHaveLength(2);
    // And the custom name is still not carried forward.
    const entry = await ctx.client.query<{ custom_name: string | null }>(
      `SELECT custom_name FROM team_entries WHERE id = $1`,
      [newEntryId],
    );
    expect(entry.rows[0]!.custom_name).toBeNull();
  });

  // The account points at the person, and rollover copies assignments — so the
  // link needs no rewriting at all, and next season's row is the same human
  // (ADR 0009), not a copy of their contact details.
  it("keeps a linked account pointing at the person, now on the new entry", async () => {
    await seedClubConfig(100);
    const old = await seedSeason("2025/26", "active", "2025-09-01");
    const next = await seedSeason("2026/27", "upcoming", "2026-09-01");
    const oldLeague = await seedLeague(50, "U14", old);
    await seedLeague(51, "U16", next);
    const squad = await seedTeam(9700, "Dragons U16");
    const oldEntry = await ctx.client.query<{ id: number }>(
      `INSERT INTO team_entries (team_id, season_id, league_id) VALUES ($1, $2, $3) RETURNING id`,
      [squad, old, oldLeague],
    );
    const oldEntryId = oldEntry.rows[0]!.id;
    // Two rows, so a copy that duplicated people would be visible.
    await seedStaff(oldEntryId, { firstName: "Ada", lastName: "Lovelace", role: "trainer" });
    const benPersonId = await seedStaff(oldEntryId, {
      firstName: "Ben",
      lastName: "Byron",
      role: "co_trainer",
    });
    await ctx.client.query(
      `INSERT INTO "user" (id, name, email, role, person_id) VALUES ($1, $2, $3, $4, $5)`,
      ["coach-1", "Ben Byron", "ben@example.de", "coach", benPersonId],
    );
    vi.mocked(fetchLeagueRoster).mockResolvedValue([ref(9700, "Dragons U16", 100)]);

    await seedSeasonTeamEntries(next, [51]);

    const newEntryId = await entryIdOf(squad, next);
    const linked = await ctx.client.query<{
      team_entry_id: number;
      last_name: string;
      role: string;
    }>(
      `SELECT ts.team_entry_id, p.last_name, u.role
       FROM "user" u
       JOIN staff_people p ON p.id = u.person_id
       JOIN team_staff ts ON ts.person_id = p.id AND ts.team_entry_id = $1
       WHERE u.id = 'coach-1'`,
      [newEntryId],
    );
    expect(linked.rows[0]).toEqual({
      team_entry_id: newEntryId,
      last_name: "Byron",
      role: "coach",
    });
    // One person per human, on both seasons' entries.
    const people = await ctx.client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM staff_people`,
    );
    expect(people.rows[0]!.count).toBe("2");
  });

  // Nothing links to these rows, so the mapping must simply do nothing rather
  // than, say, claim the first account it finds.
  it("carries staff forward unchanged when no account is linked", async () => {
    await seedClubConfig(100);
    const old = await seedSeason("2025/26", "active", "2025-09-01");
    const next = await seedSeason("2026/27", "upcoming", "2026-09-01");
    const oldLeague = await seedLeague(50, "U14", old);
    await seedLeague(51, "U16", next);
    const squad = await seedTeam(9700, "Dragons U16");
    const oldEntry = await ctx.client.query<{ id: number }>(
      `INSERT INTO team_entries (team_id, season_id, league_id) VALUES ($1, $2, $3) RETURNING id`,
      [squad, old, oldLeague],
    );
    await seedStaff(oldEntry.rows[0]!.id, {
      firstName: "Ada",
      lastName: "Lovelace",
      role: "trainer",
    });
    await ctx.client.query(
      `INSERT INTO "user" (id, name, email) VALUES ('u-unlinked', 'Nobody', 'nobody@example.de')`,
    );
    vi.mocked(fetchLeagueRoster).mockResolvedValue([ref(9700, "Dragons U16", 100)]);

    await seedSeasonTeamEntries(next, [51]);

    const rows = await ctx.client.query<{ person_id: number | null }>(
      `SELECT person_id FROM "user" WHERE id = 'u-unlinked'`,
    );
    expect(rows.rows[0]!.person_id).toBeNull();
    expect((await staffOfEntry(await entryIdOf(squad, next))).rows).toHaveLength(1);
  });

  it("copies from the chronologically latest previous entry, not from every one", async () => {
    await seedClubConfig(100);
    const older = await seedSeason("2024/25", "archived", "2024-09-01");
    const newer = await seedSeason("2025/26", "active", "2025-09-01");
    const next = await seedSeason("2026/27", "upcoming", "2026-09-01");
    const olderLeague = await seedLeague(52, "U12", older);
    const newerLeague = await seedLeague(53, "U14", newer);
    await seedLeague(54, "U16", next);
    const squad = await seedTeam(9800, "Dragons U16");
    const olderEntry = await ctx.client.query<{ id: number }>(
      `INSERT INTO team_entries (team_id, season_id, league_id) VALUES ($1, $2, $3) RETURNING id`,
      [squad, older, olderLeague],
    );
    const newerEntry = await ctx.client.query<{ id: number }>(
      `INSERT INTO team_entries (team_id, season_id, league_id) VALUES ($1, $2, $3) RETURNING id`,
      [squad, newer, newerLeague],
    );
    await seedStaff(olderEntry.rows[0]!.id, {
      firstName: "Old",
      lastName: "Coach",
      role: "trainer",
    });
    await seedStaff(newerEntry.rows[0]!.id, {
      firstName: "Current",
      lastName: "Coach",
      role: "trainer",
    });
    vi.mocked(fetchLeagueRoster).mockResolvedValue([ref(9800, "Dragons U16", 100)]);

    await seedSeasonTeamEntries(next, [54]);

    const staff = await staffOfEntry(await entryIdOf(squad, next));
    expect(staff.rows.map((r) => r.first_name)).toEqual(["Current"]);
  });

  it("creates the entry with no staff when the previous entry had none", async () => {
    await seedClubConfig(100);
    const old = await seedSeason("2025/26", "active", "2025-09-01");
    const next = await seedSeason("2026/27", "upcoming", "2026-09-01");
    const oldLeague = await seedLeague(55, "U14", old);
    await seedLeague(56, "U16", next);
    const squad = await seedTeam(9900, "Dragons U16");
    await ctx.client.query(
      `INSERT INTO team_entries (team_id, season_id, league_id) VALUES ($1, $2, $3)`,
      [squad, old, oldLeague],
    );
    vi.mocked(fetchLeagueRoster).mockResolvedValue([ref(9900, "Dragons U16", 100)]);

    await seedSeasonTeamEntries(next, [56]);

    expect((await staffOfEntry(await entryIdOf(squad, next))).rows).toEqual([]);
  });

  it("adds no staff to an entry seeded for a squad with no previous entry", async () => {
    await seedClubConfig(100);
    const season = await seedSeason("2026/27", "upcoming", "2026-09-01");
    await seedLeague(57, "U16", season);
    vi.mocked(fetchLeagueRoster).mockResolvedValue([ref(9950, "Dragons U16", 100)]);

    await seedSeasonTeamEntries(season, [57]);

    const squadRow = await ctx.client.query<{ id: number }>(
      `SELECT id FROM teams WHERE api_team_permanent_id = 9950`,
    );
    expect((await staffOfEntry(await entryIdOf(squadRow.rows[0]!.id, season))).rows).toEqual([]);
  });
});
