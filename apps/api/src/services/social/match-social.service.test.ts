import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";
import { seedActiveSeason } from "../../test/seed-season";

// --- Mocks (hoisted before imports) ---
//
// Deliberately NOT mocking drizzle-orm, drizzle-orm/pg-core's `alias`, or
// @dragons/db/schema. This service is a two-alias self-join plus a date window
// and a score filter; the old suite stubbed all of that and then asserted on a
// JSON snapshot of the fake predicate tree it had just built
// (`expect(whereArg.and[2]).toEqual({ and: [...] })`), which pins the shape of
// the mock rather than the behaviour of the query. Dropping the `lte` upper
// bound was caught only because the tuple got shorter, not because any wrong
// match came back.

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

import { getWeekendMatches } from "./match-social.service";
import { matches, teams, leagues, teamEntries } from "@dragons/db/schema";
import { eq } from "drizzle-orm";

// ISO week 10 of 2026 runs Monday 2026-03-02 .. Sunday 2026-03-08.
const WEEK = { week: 10, year: 2026 } as const;
const MONDAY = "2026-03-02";
const SUNDAY = "2026-03-08";
const DAY_BEFORE = "2026-03-01";
const DAY_AFTER = "2026-03-09";

const OWN_HOME = 1;
const OPPONENT = 2;
const OWN_GUEST = 3;
const FOREIGN = 4;

let ctx: TestDbContext;
let nextApiMatchId = 1;
let nextApiLigaId = 1;
let activeSeasonId: number;
let defaultLeagueId: number;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
  nextApiMatchId = 1;
  nextApiLigaId = 1;
  activeSeasonId = await seedActiveSeason(ctx);
  await ctx.db.insert(teams).values([
    {
      apiTeamPermanentId: OWN_HOME,
      seasonTeamId: 10,
      teamCompetitionId: 1,
      name: "SG Dragons Hannover 1",
      nameShort: "Dragons H1",
      clubId: 1,
      isOwnClub: true,
    },
    {
      apiTeamPermanentId: OPPONENT,
      seasonTeamId: 20,
      teamCompetitionId: 2,
      name: "TV Bergkrug Osnabrück",
      nameShort: "TV Bergkrug",
      clubId: 2,
      isOwnClub: false,
    },
    {
      apiTeamPermanentId: OWN_GUEST,
      seasonTeamId: 30,
      teamCompetitionId: 3,
      name: "SG Dragons Hannover Damen 1",
      nameShort: "Dragons D1",
      clubId: 1,
      isOwnClub: true,
    },
    {
      apiTeamPermanentId: FOREIGN,
      seasonTeamId: 40,
      teamCompetitionId: 4,
      name: "Rival Club",
      nameShort: "Rivals",
      clubId: 3,
      isOwnClub: false,
    },
  ]);
  defaultLeagueId = await seedLeague();
  // customName lives only on the season-scoped team_entries row.
  await seedEntry(OWN_HOME, { customName: "Herren 1" });
  await seedEntry(OWN_GUEST, { customName: "Damen 1" });
});

afterAll(async () => {
  await closeTestDb(ctx);
});

interface MatchSpec {
  home?: number;
  guest?: number;
  date?: string;
  time?: string;
  homeScore?: number | null;
  guestScore?: number | null;
  leagueId?: number | null;
}

async function seedMatch(spec: MatchSpec = {}): Promise<number> {
  const apiMatchId = nextApiMatchId++;
  const [row] = await ctx.db
    .insert(matches)
    .values({
      apiMatchId,
      matchNo: apiMatchId,
      matchDay: 1,
      kickoffDate: spec.date ?? "2026-03-07",
      kickoffTime: spec.time ?? "18:00:00",
      homeTeamApiId: spec.home ?? OWN_HOME,
      guestTeamApiId: spec.guest ?? OPPONENT,
      homeScore: spec.homeScore ?? null,
      guestScore: spec.guestScore ?? null,
      leagueId: spec.leagueId === undefined ? defaultLeagueId : spec.leagueId,
    })
    .returning({ id: matches.id });
  return row!.id;
}

/** A finished own-club home match inside the target week. */
function seedResult(spec: MatchSpec = {}) {
  return seedMatch({ homeScore: 96, guestScore: 52, ...spec });
}

/** Insert a league belonging to the active season and return its id. */
async function seedLeague(): Promise<number> {
  const n = nextApiLigaId++;
  const [row] = await ctx.db
    .insert(leagues)
    .values({
      apiLigaId: 90000 + n,
      ligaNr: 9000 + n,
      name: `Liga ${n}`,
      seasonId: 2025,
      seasonName: "2025/26",
      seasonRefId: activeSeasonId,
    })
    .returning({ id: leagues.id });
  return row!.id;
}

/** Insert a season-scoped team_entries row for the given apiTeamPermanentId. */
async function seedEntry(
  apiTeamPermanentId: number,
  fields: { customName?: string | null } = {},
): Promise<void> {
  const [team] = await ctx.db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.apiTeamPermanentId, apiTeamPermanentId));
  await ctx.db.insert(teamEntries).values({
    teamId: team!.id,
    seasonId: activeSeasonId,
    customName: fields.customName ?? null,
  });
}

describe("getWeekendMatches — row mapping", () => {
  it("maps a home own-club result", async () => {
    const id = await seedResult({ date: "2026-03-07", time: "18:00:00" });

    const result = await getWeekendMatches({ type: "results", ...WEEK });

    expect(result).toEqual([
      {
        id,
        teamLabel: "Herren 1",
        opponent: "TV Bergkrug",
        isHome: true,
        kickoffDate: "2026-03-07",
        kickoffTime: "18:00:00",
        homeScore: 96,
        guestScore: 52,
      },
    ]);
  });

  it("maps an away own-club result from the guest perspective", async () => {
    await seedResult({ home: FOREIGN, guest: OWN_GUEST });

    const [item] = await getWeekendMatches({ type: "results", ...WEEK });

    expect(item).toMatchObject({
      isHome: false,
      teamLabel: "Damen 1",
      opponent: "Rivals",
    });
  });

  it("orders by kickoff date then time", async () => {
    const late = await seedResult({ date: "2026-03-07", time: "20:00:00" });
    const early = await seedResult({ date: "2026-03-07", time: "14:00:00" });
    const saturday = await seedResult({ date: "2026-03-06", time: "23:00:00" });

    const result = await getWeekendMatches({ type: "results", ...WEEK });

    expect(result.map((m) => m.id)).toEqual([saturday, early, late]);
  });
});

describe("getWeekendMatches — team label fallback chain", () => {
  it("prefers customName", async () => {
    await seedResult();
    const [item] = await getWeekendMatches({ type: "results", ...WEEK });
    expect(item!.teamLabel).toBe("Herren 1");
  });

  it("resolves the label from the season team_entries row, not the stale teams row", async () => {
    // beforeEach already seeds a teams.custom_name that diverges from the
    // team_entries.custom_name for OWN_HOME (see comments there). This
    // assertion is the one that actually distinguishes the two sources: it
    // fails today (reads "STALE teams-row Herren 1") and passes once the
    // query is ported to join team_entries.
    await seedResult();

    const [item] = await getWeekendMatches({ type: "results", ...WEEK });

    expect(item!.teamLabel).toBe("Herren 1");
    expect(item!.teamLabel).not.toBe("STALE teams-row Herren 1");
  });

  it("falls back to nameShort when the entry's customName is null", async () => {
    await ctx.client.query(
      `UPDATE team_entries SET custom_name = NULL
       WHERE team_id = (SELECT id FROM teams WHERE api_team_permanent_id = $1)`,
      [OWN_HOME],
    );
    await seedResult();

    const [item] = await getWeekendMatches({ type: "results", ...WEEK });

    expect(item!.teamLabel).toBe("Dragons H1");
  });

  it("falls back to name when the entry's customName and teams' nameShort are both null", async () => {
    await ctx.client.query(
      `UPDATE team_entries SET custom_name = NULL
       WHERE team_id = (SELECT id FROM teams WHERE api_team_permanent_id = $1)`,
      [OWN_HOME],
    );
    await ctx.client.query(
      "UPDATE teams SET name_short = NULL WHERE api_team_permanent_id = $1",
      [OWN_HOME],
    );
    await seedResult();

    const [item] = await getWeekendMatches({ type: "results", ...WEEK });

    expect(item!.teamLabel).toBe("SG Dragons Hannover 1");
  });

  it("applies the same chain to the opponent label", async () => {
    await seedResult();
    const [item] = await getWeekendMatches({ type: "results", ...WEEK });
    // Opponent has no team_entries row at all, so nameShort wins.
    expect(item!.opponent).toBe("TV Bergkrug");
  });

  it("returns a leagueless match, falling back to nameShort since no entry can resolve without a season", async () => {
    // No league on the match means no leagues.seasonRefId to scope the entry
    // join by, so the LEFT JOIN produces no entry row even though one exists
    // for this team. This pins that leagueless matches are still returned
    // (not silently dropped by an accidental INNER JOIN on leagues).
    const id = await seedResult({ leagueId: null });

    const result = await getWeekendMatches({ type: "results", ...WEEK });
    const item = result.find((m) => m.id === id);

    expect(item).toBeDefined();
    expect(item!.teamLabel).toBe("Dragons H1");
  });
});

describe("getWeekendMatches — own-club filter", () => {
  it("drops matches where neither side is own club", async () => {
    await seedResult({ home: OPPONENT, guest: FOREIGN });

    expect(await getWeekendMatches({ type: "results", ...WEEK })).toEqual([]);
  });

  it("keeps a match where only the guest is own club", async () => {
    await seedResult({ home: FOREIGN, guest: OWN_GUEST });

    const result = await getWeekendMatches({ type: "results", ...WEEK });

    expect(result).toHaveLength(1);
    expect(result[0]!.isHome).toBe(false);
  });

  it("keeps a match where only the home side is own club", async () => {
    await seedResult();

    const result = await getWeekendMatches({ type: "results", ...WEEK });

    expect(result).toHaveLength(1);
    expect(result[0]!.isHome).toBe(true);
  });

  it("returns an empty list when nothing is scheduled", async () => {
    expect(await getWeekendMatches({ type: "preview", ...WEEK })).toEqual([]);
  });
});

describe("getWeekendMatches — score filter (#82)", () => {
  it("requires BOTH scores present for results, not just homeScore", async () => {
    const finished = await seedResult();
    await seedMatch({ homeScore: 96, guestScore: null });
    await seedMatch({ homeScore: null, guestScore: 52 });

    const result = await getWeekendMatches({ type: "results", ...WEEK });

    // A one-sided score is a data glitch, not a played game.
    expect(result.map((m) => m.id)).toEqual([finished]);
  });

  it("requires BOTH scores absent for previews", async () => {
    const upcoming = await seedMatch();
    await seedMatch({ homeScore: 96, guestScore: null });
    await seedMatch({ homeScore: null, guestScore: 52 });
    await seedMatch({ homeScore: 96, guestScore: 52 });

    const result = await getWeekendMatches({ type: "preview", ...WEEK });

    expect(result.map((m) => m.id)).toEqual([upcoming]);
  });

  it("returns null scores for preview matches", async () => {
    await seedMatch();

    const [item] = await getWeekendMatches({ type: "preview", ...WEEK });

    expect(item).toMatchObject({ homeScore: null, guestScore: null });
  });
});

describe("getWeekendMatches — ISO week window", () => {
  // The window must be formatted in local time. `toISOString()` in a
  // positive-offset zone rolls local-midnight Monday back to Sunday and shifts
  // the whole window by a day, so every zone below has to agree.
  const zones = ["UTC", "America/New_York", "Europe/Berlin"] as const;

  let previousTz: string | undefined;

  beforeEach(() => {
    previousTz = process.env.TZ;
  });

  afterEach(() => {
    process.env.TZ = previousTz;
  });

  it.each(zones)("spans Monday..Sunday inclusive in %s", async (tz) => {
    process.env.TZ = tz;
    const before = await seedResult({ date: DAY_BEFORE });
    const monday = await seedResult({ date: MONDAY });
    const sunday = await seedResult({ date: SUNDAY });
    const after = await seedResult({ date: DAY_AFTER });

    const ids = (await getWeekendMatches({ type: "results", ...WEEK })).map((m) => m.id);

    expect(ids).toEqual([monday, sunday]);
    expect(ids).not.toContain(before);
    expect(ids).not.toContain(after);
  });

  it("excludes a match one day past the window's end", async () => {
    await seedResult({ date: DAY_AFTER });

    expect(await getWeekendMatches({ type: "results", ...WEEK })).toEqual([]);
  });

  it("resolves week 1 into the previous calendar year when ISO week 1 starts there", async () => {
    // ISO week 1 of 2026 runs 2025-12-29 .. 2026-01-04.
    const inWeek = await seedResult({ date: "2025-12-29" });
    await seedResult({ date: "2025-12-28" });

    const result = await getWeekendMatches({ type: "results", week: 1, year: 2026 });

    expect(result.map((m) => m.id)).toEqual([inWeek]);
  });

  it("resolves week 53 into the following calendar year", async () => {
    // ISO week 53 of 2026 runs 2026-12-28 .. 2027-01-03.
    const inWeek = await seedResult({ date: "2027-01-03" });
    await seedResult({ date: "2027-01-04" });

    const result = await getWeekendMatches({ type: "results", week: 53, year: 2026 });

    expect(result.map((m) => m.id)).toEqual([inWeek]);
  });
});
