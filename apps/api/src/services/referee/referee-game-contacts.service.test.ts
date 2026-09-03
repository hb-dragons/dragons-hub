import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

// Same reasoning as `referee-game-visibility.service.test.ts` (issue #110):
// nothing here is mocked below the driver. What this service does IS the join
// across referee_games → matches → leagues → team_entries → team_staff, so it
// runs against a real (in-process PGlite) Postgres.

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

import { getRefereeGameContacts } from "./referee-game-contacts.service";
import { invalidateActiveSeasonCache } from "../admin/season.service";
import {
  refereeGames,
  matches,
  leagues,
  seasons,
  teams,
  teamEntries,
  teamStaff,
} from "@dragons/db/schema";
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
  // getActiveSeasonId() caches for 60s and every test starts on a clean DB.
  invalidateActiveSeasonCache();
});

afterAll(async () => {
  await closeTestDb(ctx);
});

// --- Helpers ---

let nextApiId = 1;
function apiId(): number {
  nextApiId += 1;
  return nextApiId;
}

async function seedSeason(
  name: string,
  status: "active" | "upcoming" | "archived",
): Promise<number> {
  const [row] = await ctx.db
    .insert(seasons)
    .values({ name, status })
    .returning({ id: seasons.id });
  return row!.id;
}

async function seedLeague(seasonRefId: number): Promise<number> {
  const id = apiId();
  const [row] = await ctx.db
    .insert(leagues)
    .values({
      apiLigaId: id,
      ligaNr: id,
      name: `Liga ${String(id)}`,
      seasonId: id,
      seasonName: "2026/27",
      seasonRefId,
    })
    .returning({ id: leagues.id });
  return row!.id;
}

async function seedTeam(opts: {
  name: string;
  nameShort?: string | null;
  isOwnClub: boolean;
}): Promise<{ teamId: number; apiTeamPermanentId: number }> {
  const permanentId = apiId();
  const [row] = await ctx.db
    .insert(teams)
    .values({
      apiTeamPermanentId: permanentId,
      seasonTeamId: permanentId,
      teamCompetitionId: permanentId,
      name: opts.name,
      nameShort: opts.nameShort ?? null,
      clubId: opts.isOwnClub ? 1 : 2,
      isOwnClub: opts.isOwnClub,
    })
    .returning({ id: teams.id });
  return { teamId: row!.id, apiTeamPermanentId: permanentId };
}

async function seedEntry(opts: {
  teamId: number;
  seasonId: number;
  customName?: string | null;
}): Promise<number> {
  const [row] = await ctx.db
    .insert(teamEntries)
    .values({
      teamId: opts.teamId,
      seasonId: opts.seasonId,
      customName: opts.customName ?? null,
    })
    .returning({ id: teamEntries.id });
  return row!.id;
}

async function seedStaff(opts: {
  teamEntryId: number;
  firstName: string;
  lastName: string;
  role?: "trainer" | "co_trainer";
  phone?: string | null;
  email?: string | null;
  refereeContact?: boolean;
}): Promise<void> {
  await ctx.db.insert(teamStaff).values({
    teamEntryId: opts.teamEntryId,
    firstName: opts.firstName,
    lastName: opts.lastName,
    role: opts.role ?? "trainer",
    phone: opts.phone ?? null,
    email: opts.email ?? null,
    refereeContact: opts.refereeContact ?? false,
  });
}

async function seedMatch(opts: {
  leagueId: number | null;
  homeTeamApiId: number;
  guestTeamApiId: number;
  anschreiber?: string | null;
  zeitnehmer?: string | null;
  shotclock?: string | null;
}): Promise<number> {
  const id = apiId();
  const [row] = await ctx.db
    .insert(matches)
    .values({
      apiMatchId: id,
      matchNo: id,
      matchDay: 1,
      kickoffDate: "2026-04-25",
      kickoffTime: "14:00:00",
      leagueId: opts.leagueId,
      homeTeamApiId: opts.homeTeamApiId,
      guestTeamApiId: opts.guestTeamApiId,
      anschreiber: opts.anschreiber ?? null,
      zeitnehmer: opts.zeitnehmer ?? null,
      shotclock: opts.shotclock ?? null,
    })
    .returning({ id: matches.id });
  return row!.id;
}

async function seedRefereeGame(opts: {
  matchId?: number | null;
  isHomeGame?: boolean;
  homeTeamId?: number | null;
  guestTeamId?: number | null;
}): Promise<number> {
  const id = apiId();
  const [row] = await ctx.db
    .insert(refereeGames)
    .values({
      apiMatchId: id,
      matchNo: id,
      matchId: opts.matchId ?? null,
      kickoffDate: "2026-04-25",
      kickoffTime: "14:00:00",
      homeTeamName: "Dragons 1",
      guestTeamName: "Titans 1",
      sr1OurClub: true,
      sr2OurClub: true,
      isHomeGame: opts.isHomeGame ?? true,
      isGuestGame: !(opts.isHomeGame ?? true),
      homeTeamId: opts.homeTeamId ?? null,
      guestTeamId: opts.guestTeamId ?? null,
    })
    .returning({ id: refereeGames.id });
  return row!.id;
}

/**
 * The standard fixture: an active season, a tracked league in it, one own-club
 * team entry playing at home with a coach, and a home game whose Kampfgericht
 * is run by a second own-club team.
 */
async function seedHomeGame(
  overrides: {
    anschreiber?: string | null;
    zeitnehmer?: string | null;
    shotclock?: string | null;
  } = {},
) {
  const seasonId = await seedSeason("2026/27", "active");
  const leagueId = await seedLeague(seasonId);

  const playing = await seedTeam({ name: "Dragons 1", isOwnClub: true });
  const kampf = await seedTeam({ name: "Dragons 2", isOwnClub: true });
  const guest = await seedTeam({ name: "Titans 1", isOwnClub: false });

  const playingEntry = await seedEntry({ teamId: playing.teamId, seasonId });
  const kampfEntry = await seedEntry({ teamId: kampf.teamId, seasonId });

  await seedStaff({
    teamEntryId: playingEntry,
    firstName: "Ana",
    lastName: "Berger",
    phone: "+49 111",
    email: "ana@example.de",
  });
  await seedStaff({
    teamEntryId: kampfEntry,
    firstName: "Kim",
    lastName: "Draak",
    role: "co_trainer",
    phone: "+49 222",
  });

  const matchId = await seedMatch({
    leagueId,
    homeTeamApiId: playing.apiTeamPermanentId,
    guestTeamApiId: guest.apiTeamPermanentId,
    anschreiber: overrides.anschreiber === undefined ? "Dragons 2" : overrides.anschreiber,
    zeitnehmer: overrides.zeitnehmer === undefined ? "Dragons 2" : overrides.zeitnehmer,
    shotclock: overrides.shotclock === undefined ? "Dragons 2" : overrides.shotclock,
  });

  const gameId = await seedRefereeGame({
    matchId,
    isHomeGame: true,
    homeTeamId: playing.teamId,
    guestTeamId: guest.teamId,
  });

  return { seasonId, leagueId, gameId, matchId, playing, kampf, guest, playingEntry, kampfEntry };
}

// ---------------------------------------------------------------------------

describe("getRefereeGameContacts", () => {
  it("returns the playing team's contact and the Kampfgericht team's own", async () => {
    const { gameId, playingEntry } = await seedHomeGame();

    const result = await getRefereeGameContacts(gameId);

    expect(result.contacts).toEqual([
      {
        teamEntryId: playingEntry,
        teamName: "Dragons 1",
        contacts: [
          {
            firstName: "Ana",
            lastName: "Berger",
            role: "trainer",
            phone: "+49 111",
            email: "ana@example.de",
          },
        ],
      },
    ]);
    expect(result.kampfgericht).toEqual([
      {
        roles: ["anschreiber", "zeitnehmer", "shotclock"],
        teamName: "Dragons 2",
        contacts: [
          {
            firstName: "Kim",
            lastName: "Draak",
            role: "co_trainer",
            phone: "+49 222",
            email: null,
          },
        ],
      },
    ]);
  });

  it("splits the Kampfgericht into one entry per team when the roles differ", async () => {
    const { gameId } = await seedHomeGame({ shotclock: "Dragons 1" });

    const result = await getRefereeGameContacts(gameId);

    expect(result.kampfgericht.map((k) => [k.teamName, k.roles])).toEqual([
      ["Dragons 2", ["anschreiber", "zeitnehmer"]],
      ["Dragons 1", ["shotclock"]],
    ]);
  });

  // One person, one place: the playing team's coach is already under
  // `contacts`, so the Kampfgericht line naming that same team carries none.
  it("does not repeat a contact when the Kampfgericht team is the playing team", async () => {
    const { gameId } = await seedHomeGame({
      anschreiber: "Dragons 1",
      zeitnehmer: "Dragons 1",
      shotclock: "Dragons 1",
    });

    const result = await getRefereeGameContacts(gameId);

    expect(result.kampfgericht).toEqual([
      { roles: ["anschreiber", "zeitnehmer", "shotclock"], teamName: "Dragons 1", contacts: [] },
    ]);
    expect(result.contacts[0]?.contacts).toHaveLength(1);
  });

  it("names a Kampfgericht team with no entry of its own without contacts", async () => {
    const { gameId } = await seedHomeGame({
      anschreiber: "Dragons 9",
      zeitnehmer: "Dragons 9",
      shotclock: "Dragons 9",
    });

    const result = await getRefereeGameContacts(gameId);

    expect(result.kampfgericht).toEqual([
      { roles: ["anschreiber", "zeitnehmer", "shotclock"], teamName: "Dragons 9", contacts: [] },
    ]);
  });

  it("skips a role the match leaves unset", async () => {
    const { gameId } = await seedHomeGame({ zeitnehmer: null, shotclock: null });

    const result = await getRefereeGameContacts(gameId);

    expect(result.kampfgericht).toEqual([
      expect.objectContaining({ roles: ["anschreiber"], teamName: "Dragons 2" }),
    ]);
  });

  it("has no Kampfgericht at all when the match names nobody", async () => {
    const { gameId } = await seedHomeGame({
      anschreiber: null,
      zeitnehmer: null,
      shotclock: null,
    });

    expect((await getRefereeGameContacts(gameId)).kampfgericht).toEqual([]);
  });

  // Kampfgericht names live on the linked match, so an unlinked referee game
  // has nothing to read them off — the contact block still resolves.
  it("has no Kampfgericht when the referee game has no linked match", async () => {
    const seasonId = await seedSeason("2026/27", "active");
    const playing = await seedTeam({ name: "Dragons 1", isOwnClub: true });
    const entry = await seedEntry({ teamId: playing.teamId, seasonId });
    await seedStaff({ teamEntryId: entry, firstName: "Ana", lastName: "Berger" });

    const gameId = await seedRefereeGame({
      matchId: null,
      isHomeGame: true,
      homeTeamId: playing.teamId,
    });

    const result = await getRefereeGameContacts(gameId);

    expect(result.kampfgericht).toEqual([]);
    expect(result.contacts).toHaveLength(1);
  });

  it("has no Kampfgericht on an away game", async () => {
    const seasonId = await seedSeason("2026/27", "active");
    const leagueId = await seedLeague(seasonId);
    const playing = await seedTeam({ name: "Dragons 1", isOwnClub: true });
    const kampf = await seedTeam({ name: "Dragons 2", isOwnClub: true });
    const host = await seedTeam({ name: "Titans 1", isOwnClub: false });
    const entry = await seedEntry({ teamId: playing.teamId, seasonId });
    await seedEntry({ teamId: kampf.teamId, seasonId });
    await seedStaff({ teamEntryId: entry, firstName: "Ana", lastName: "Berger" });

    const matchId = await seedMatch({
      leagueId,
      homeTeamApiId: host.apiTeamPermanentId,
      guestTeamApiId: playing.apiTeamPermanentId,
      anschreiber: "Dragons 2",
      zeitnehmer: "Dragons 2",
      shotclock: "Dragons 2",
    });
    const gameId = await seedRefereeGame({
      matchId,
      isHomeGame: false,
      homeTeamId: host.teamId,
      guestTeamId: playing.teamId,
    });

    const result = await getRefereeGameContacts(gameId);

    expect(result.kampfgericht).toEqual([]);
    expect(result.contacts.map((c) => c.teamName)).toEqual(["Dragons 1"]);
  });

  // A game between two other clubs that our referees officiate. Nobody in the
  // fixture is ours, so there is nobody for a referee to call.
  it("returns no contacts for a foreign game", async () => {
    const seasonId = await seedSeason("2026/27", "active");
    const leagueId = await seedLeague(seasonId);
    const own = await seedTeam({ name: "Dragons 1", isOwnClub: true });
    const entry = await seedEntry({ teamId: own.teamId, seasonId });
    await seedStaff({ teamEntryId: entry, firstName: "Ana", lastName: "Berger" });

    const home = await seedTeam({ name: "Titans 1", isOwnClub: false });
    const guest = await seedTeam({ name: "Giants 1", isOwnClub: false });
    const matchId = await seedMatch({
      leagueId,
      homeTeamApiId: home.apiTeamPermanentId,
      guestTeamApiId: guest.apiTeamPermanentId,
      anschreiber: "Titans 1",
    });
    const gameId = await seedRefereeGame({
      matchId,
      isHomeGame: false,
      homeTeamId: home.teamId,
      guestTeamId: guest.teamId,
    });

    const result = await getRefereeGameContacts(gameId);

    expect(result.contacts).toEqual([]);
    expect(result.kampfgericht).toEqual([]);
  });

  it("lists both teams on a derby, home first", async () => {
    const seasonId = await seedSeason("2026/27", "active");
    const leagueId = await seedLeague(seasonId);
    const first = await seedTeam({ name: "Dragons 1", isOwnClub: true });
    const second = await seedTeam({ name: "Dragons 2", isOwnClub: true });
    const firstEntry = await seedEntry({ teamId: first.teamId, seasonId });
    const secondEntry = await seedEntry({ teamId: second.teamId, seasonId });
    await seedStaff({ teamEntryId: firstEntry, firstName: "Ana", lastName: "Berger" });
    await seedStaff({ teamEntryId: secondEntry, firstName: "Kim", lastName: "Draak" });

    const matchId = await seedMatch({
      leagueId,
      homeTeamApiId: first.apiTeamPermanentId,
      guestTeamApiId: second.apiTeamPermanentId,
    });
    const gameId = await seedRefereeGame({
      matchId,
      isHomeGame: true,
      homeTeamId: first.teamId,
      guestTeamId: second.teamId,
    });

    const result = await getRefereeGameContacts(gameId);

    expect(result.contacts.map((c) => c.teamName)).toEqual(["Dragons 1", "Dragons 2"]);
  });

  // The flag is how a team says "call this person, not the whole bench".
  it("returns only the flagged members when a team flags a referee contact", async () => {
    const seasonId = await seedSeason("2026/27", "active");
    const own = await seedTeam({ name: "Dragons 1", isOwnClub: true });
    const entry = await seedEntry({ teamId: own.teamId, seasonId });
    await seedStaff({ teamEntryId: entry, firstName: "Ana", lastName: "Berger" });
    await seedStaff({
      teamEntryId: entry,
      firstName: "Kim",
      lastName: "Draak",
      refereeContact: true,
    });

    const gameId = await seedRefereeGame({ homeTeamId: own.teamId });

    const result = await getRefereeGameContacts(gameId);

    expect(result.contacts[0]?.contacts.map((c) => c.lastName)).toEqual(["Draak"]);
  });

  it("falls back to every coach when nobody is flagged", async () => {
    const seasonId = await seedSeason("2026/27", "active");
    const own = await seedTeam({ name: "Dragons 1", isOwnClub: true });
    const entry = await seedEntry({ teamId: own.teamId, seasonId });
    await seedStaff({ teamEntryId: entry, firstName: "Ana", lastName: "Berger" });
    await seedStaff({
      teamEntryId: entry,
      firstName: "Kim",
      lastName: "Draak",
      role: "co_trainer",
    });

    const gameId = await seedRefereeGame({ homeTeamId: own.teamId });

    const result = await getRefereeGameContacts(gameId);

    expect(result.contacts[0]?.contacts.map((c) => c.lastName).sort()).toEqual([
      "Berger",
      "Draak",
    ]);
  });

  it("omits a playing team that has no staff at all", async () => {
    const seasonId = await seedSeason("2026/27", "active");
    const own = await seedTeam({ name: "Dragons 1", isOwnClub: true });
    await seedEntry({ teamId: own.teamId, seasonId });

    const gameId = await seedRefereeGame({ homeTeamId: own.teamId });

    expect((await getRefereeGameContacts(gameId)).contacts).toEqual([]);
  });

  // The team entry is the one in the linked match's season, not today's. A
  // referee opening a game from a finished season sees that season's coach.
  it("reads the team entry of the linked match's season, not the active one", async () => {
    const pastSeason = await seedSeason("2025/26", "archived");
    await seedSeason("2026/27", "active");
    const pastLeague = await seedLeague(pastSeason);

    const own = await seedTeam({ name: "Dragons 1", isOwnClub: true });
    const guest = await seedTeam({ name: "Titans 1", isOwnClub: false });
    const pastEntry = await seedEntry({ teamId: own.teamId, seasonId: pastSeason });
    await seedStaff({ teamEntryId: pastEntry, firstName: "Ana", lastName: "Altcoach" });

    const matchId = await seedMatch({
      leagueId: pastLeague,
      homeTeamApiId: own.apiTeamPermanentId,
      guestTeamApiId: guest.apiTeamPermanentId,
    });
    const gameId = await seedRefereeGame({
      matchId,
      homeTeamId: own.teamId,
      guestTeamId: guest.teamId,
    });

    const result = await getRefereeGameContacts(gameId);

    expect(result.contacts[0]?.contacts.map((c) => c.lastName)).toEqual(["Altcoach"]);
  });

  it("falls back to the active season when the referee game has no linked match", async () => {
    await seedSeason("2025/26", "archived");
    const activeSeason = await seedSeason("2026/27", "active");

    const own = await seedTeam({ name: "Dragons 1", isOwnClub: true });
    const entry = await seedEntry({ teamId: own.teamId, seasonId: activeSeason });
    await seedStaff({ teamEntryId: entry, firstName: "Ana", lastName: "Neucoach" });

    const gameId = await seedRefereeGame({ matchId: null, homeTeamId: own.teamId });

    const result = await getRefereeGameContacts(gameId);

    expect(result.contacts[0]?.contacts.map((c) => c.lastName)).toEqual(["Neucoach"]);
  });

  it("returns nothing when there is no linked match and no active season", async () => {
    await seedSeason("2026/27", "upcoming");
    const own = await seedTeam({ name: "Dragons 1", isOwnClub: true });
    const gameId = await seedRefereeGame({ matchId: null, homeTeamId: own.teamId });

    expect(await getRefereeGameContacts(gameId)).toEqual({ kampfgericht: [], contacts: [] });
  });

  it("returns nothing when the season has no own-club team entries", async () => {
    await seedSeason("2026/27", "active");
    const own = await seedTeam({ name: "Dragons 1", isOwnClub: true });
    const gameId = await seedRefereeGame({ homeTeamId: own.teamId });

    expect(await getRefereeGameContacts(gameId)).toEqual({ kampfgericht: [], contacts: [] });
  });

  it("returns nothing for a game id that does not exist", async () => {
    expect(await getRefereeGameContacts(999_999)).toEqual({ kampfgericht: [], contacts: [] });
  });

  // The Kampfgericht column holds whatever the match editor wrote, and the
  // editor writes `customName ?? nameShort ?? name`.
  it("matches a Kampfgericht name against the team entry's custom name", async () => {
    const seasonId = await seedSeason("2026/27", "active");
    const leagueId = await seedLeague(seasonId);
    const playing = await seedTeam({ name: "Dragons 1", isOwnClub: true });
    const kampf = await seedTeam({
      name: "HB Dragons 2 (Herren)",
      nameShort: "Dragons 2",
      isOwnClub: true,
    });
    const guest = await seedTeam({ name: "Titans 1", isOwnClub: false });

    await seedEntry({ teamId: playing.teamId, seasonId });
    const kampfEntry = await seedEntry({
      teamId: kampf.teamId,
      seasonId,
      customName: "Herren II",
    });
    await seedStaff({ teamEntryId: kampfEntry, firstName: "Kim", lastName: "Draak" });

    const matchId = await seedMatch({
      leagueId,
      homeTeamApiId: playing.apiTeamPermanentId,
      guestTeamApiId: guest.apiTeamPermanentId,
      anschreiber: "Herren II",
    });
    const gameId = await seedRefereeGame({
      matchId,
      homeTeamId: playing.teamId,
      guestTeamId: guest.teamId,
    });

    const result = await getRefereeGameContacts(gameId);

    expect(result.kampfgericht[0]?.contacts.map((c) => c.lastName)).toEqual(["Draak"]);
  });

  it("falls back to the squad's short name when the entry has no custom name", async () => {
    const seasonId = await seedSeason("2026/27", "active");
    const leagueId = await seedLeague(seasonId);
    const playing = await seedTeam({ name: "Dragons 1", isOwnClub: true });
    const kampf = await seedTeam({
      name: "HB Dragons 2 (Herren)",
      nameShort: "Dragons 2",
      isOwnClub: true,
    });
    const guest = await seedTeam({ name: "Titans 1", isOwnClub: false });

    await seedEntry({ teamId: playing.teamId, seasonId });
    const kampfEntry = await seedEntry({ teamId: kampf.teamId, seasonId });
    await seedStaff({ teamEntryId: kampfEntry, firstName: "Kim", lastName: "Draak" });

    const matchId = await seedMatch({
      leagueId,
      homeTeamApiId: playing.apiTeamPermanentId,
      guestTeamApiId: guest.apiTeamPermanentId,
      anschreiber: "Dragons 2",
    });
    const gameId = await seedRefereeGame({
      matchId,
      homeTeamId: playing.teamId,
      guestTeamId: guest.teamId,
    });

    const result = await getRefereeGameContacts(gameId);

    expect(result.kampfgericht[0]?.teamName).toBe("Dragons 2");
    expect(result.kampfgericht[0]?.contacts.map((c) => c.lastName)).toEqual(["Draak"]);
  });

  // Past games keep both blocks — a referee still has to reach the team about
  // a game that has already been played.
  it("keeps both blocks on a game whose kickoff has passed", async () => {
    const { gameId } = await seedHomeGame();
    await ctx.db.update(refereeGames).set({ kickoffDate: "2020-01-01" });

    const result = await getRefereeGameContacts(gameId);

    expect(result.contacts).toHaveLength(1);
    expect(result.kampfgericht).toHaveLength(1);
  });
});
