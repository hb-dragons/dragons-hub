import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";

// --- Mock setup ---

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../../config/database", () => ({
  db: new Proxy(
    {},
    {
      get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
    },
  ),
}));

// --- Imports (after mocks) ---

import {
  getOwnClubMatches,
  getMatchDetail,
  updateMatchLocal,
  releaseOverride,
  computeDiffs,
} from "./match-admin.service";

// --- PGlite setup ---

const CREATE_TABLES = `
  CREATE TABLE leagues (
    id SERIAL PRIMARY KEY,
    api_liga_id INTEGER NOT NULL UNIQUE,
    liga_nr INTEGER NOT NULL,
    name VARCHAR(150) NOT NULL,
    season_id INTEGER NOT NULL,
    season_name VARCHAR(100) NOT NULL,
    sk_name VARCHAR(100),
    ak_name VARCHAR(100),
    geschlecht VARCHAR(20),
    verband_id INTEGER,
    verband_name VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    is_tracked BOOLEAN DEFAULT TRUE,
    data_hash VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE teams (
    id SERIAL PRIMARY KEY,
    api_team_permanent_id INTEGER NOT NULL UNIQUE,
    season_team_id INTEGER NOT NULL,
    team_competition_id INTEGER NOT NULL,
    name VARCHAR(150) NOT NULL,
    name_short VARCHAR(100),
    custom_name VARCHAR(50),
    club_id INTEGER NOT NULL,
    is_own_club BOOLEAN DEFAULT FALSE,
    verzicht BOOLEAN DEFAULT FALSE,
    badge_color VARCHAR(20),
    data_hash VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE venues (
    id SERIAL PRIMARY KEY,
    api_id INTEGER NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    street VARCHAR(200),
    postal_code VARCHAR(10),
    city VARCHAR(100),
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    data_hash VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE venue_bookings (
    id SERIAL PRIMARY KEY,
    venue_id INTEGER NOT NULL REFERENCES venues(id),
    date DATE NOT NULL,
    calculated_start_time TIME NOT NULL,
    calculated_end_time TIME NOT NULL,
    override_start_time TIME,
    override_end_time TIME,
    override_reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    needs_reconfirmation BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    confirmed_by TEXT,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(venue_id, date)
  );

  CREATE TABLE matches (
    id SERIAL PRIMARY KEY,
    api_match_id INTEGER NOT NULL UNIQUE,
    match_no INTEGER NOT NULL,
    match_day INTEGER NOT NULL,
    kickoff_date DATE NOT NULL,
    kickoff_time TIME NOT NULL,
    league_id INTEGER REFERENCES leagues(id),
    home_team_api_id INTEGER NOT NULL REFERENCES teams(api_team_permanent_id),
    guest_team_api_id INTEGER NOT NULL REFERENCES teams(api_team_permanent_id),
    venue_id INTEGER REFERENCES venues(id),
    is_confirmed BOOLEAN DEFAULT FALSE,
    is_forfeited BOOLEAN DEFAULT FALSE,
    is_cancelled BOOLEAN DEFAULT FALSE,
    home_score INTEGER,
    guest_score INTEGER,
    home_halftime_score INTEGER,
    guest_halftime_score INTEGER,
    period_format VARCHAR(10),
    home_q1 INTEGER,
    guest_q1 INTEGER,
    home_q2 INTEGER,
    guest_q2 INTEGER,
    home_q3 INTEGER,
    guest_q3 INTEGER,
    home_q4 INTEGER,
    guest_q4 INTEGER,
    home_q5 INTEGER,
    guest_q5 INTEGER,
    home_q6 INTEGER,
    guest_q6 INTEGER,
    home_q7 INTEGER,
    guest_q7 INTEGER,
    home_q8 INTEGER,
    guest_q8 INTEGER,
    home_ot1 INTEGER,
    guest_ot1 INTEGER,
    home_ot2 INTEGER,
    guest_ot2 INTEGER,
    sr1_open BOOLEAN NOT NULL DEFAULT FALSE,
    sr2_open BOOLEAN NOT NULL DEFAULT FALSE,
    sr3_open BOOLEAN NOT NULL DEFAULT FALSE,
    venue_name_override VARCHAR(200),
    anschreiber VARCHAR(100),
    zeitnehmer VARCHAR(100),
    shotclock VARCHAR(100),
    internal_notes TEXT,
    public_comment TEXT,
    current_remote_version INTEGER NOT NULL DEFAULT 0,
    current_local_version INTEGER NOT NULL DEFAULT 0,
    remote_data_hash VARCHAR(64),
    last_remote_sync TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE match_overrides (
    id SERIAL PRIMARY KEY,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    field_name VARCHAR(100) NOT NULL,
    reason TEXT,
    changed_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(match_id, field_name)
  );

  CREATE TABLE match_remote_versions (
    id SERIAL PRIMARY KEY,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    sync_run_id INTEGER,
    snapshot JSONB NOT NULL,
    data_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(match_id, version_number)
  );

  CREATE TABLE match_local_versions (
    id SERIAL PRIMARY KEY,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    changed_by TEXT,
    change_reason TEXT,
    snapshot JSONB NOT NULL,
    data_hash VARCHAR(64) NOT NULL,
    base_remote_version INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(match_id, version_number)
  );

  CREATE TABLE match_changes (
    id SERIAL PRIMARY KEY,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    track VARCHAR(10) NOT NULL,
    version_number INTEGER NOT NULL,
    field_name VARCHAR(100) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE venue_booking_matches (
    id SERIAL PRIMARY KEY,
    venue_booking_id INTEGER NOT NULL REFERENCES venue_bookings(id) ON DELETE CASCADE,
    match_id INTEGER NOT NULL REFERENCES matches(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(venue_booking_id, match_id)
  );

  CREATE TABLE referees (
    id SERIAL PRIMARY KEY,
    api_id INTEGER NOT NULL UNIQUE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    license_number INTEGER,
    data_hash VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE referee_roles (
    id SERIAL PRIMARY KEY,
    api_id INTEGER NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    short_name VARCHAR(20),
    data_hash VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE match_referees (
    id SERIAL PRIMARY KEY,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    referee_id INTEGER NOT NULL REFERENCES referees(id),
    role_id INTEGER NOT NULL REFERENCES referee_roles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(match_id, referee_id, role_id)
  );

  CREATE TABLE referee_assignment_intents (
    id SERIAL PRIMARY KEY,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    referee_id INTEGER NOT NULL REFERENCES referees(id),
    slot_number SMALLINT NOT NULL,
    clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_by_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(match_id, referee_id, slot_number)
  );
`;

let client: PGlite;

beforeAll(async () => {
  const pglite = await import("@electric-sql/pglite");
  const drizzlePglite = await import("drizzle-orm/pglite");

  client = new pglite.PGlite();
  dbHolder.ref = drizzlePglite.drizzle(client);

  await client.exec(CREATE_TABLES);
});

beforeEach(async () => {
  await client.exec("DELETE FROM venue_booking_matches");
  await client.exec("DELETE FROM match_changes");
  await client.exec("DELETE FROM match_local_versions");
  await client.exec("DELETE FROM match_remote_versions");
  await client.exec("DELETE FROM match_overrides");
  await client.exec("DELETE FROM matches");
  await client.exec("DELETE FROM venue_bookings");
  await client.exec("DELETE FROM venues");
  await client.exec("DELETE FROM teams");
  await client.exec("DELETE FROM leagues");
  await client.exec("ALTER SEQUENCE matches_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE leagues_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE teams_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE venues_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE match_overrides_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE match_local_versions_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE match_remote_versions_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE match_changes_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE venue_bookings_id_seq RESTART WITH 1");
  await client.exec("ALTER SEQUENCE venue_booking_matches_id_seq RESTART WITH 1");
  vi.clearAllMocks();
});

afterAll(async () => {
  await client.close();
});

// --- Helpers ---

async function insertLeague(overrides: Record<string, unknown> = {}) {
  const defaults = {
    api_liga_id: 100,
    liga_nr: 1,
    name: "Test League",
    season_id: 2025,
    season_name: "2024/2025",
  };
  const data = { ...defaults, ...overrides };
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  const result = await client.query(
    `INSERT INTO leagues (${cols.join(", ")}) VALUES (${placeholders}) RETURNING id`,
    vals,
  );
  return (result.rows[0] as { id: number }).id;
}

async function insertTeam(overrides: Record<string, unknown> = {}) {
  const defaults = {
    api_team_permanent_id: 1000,
    season_team_id: 1,
    team_competition_id: 1,
    name: "Test Team",
    club_id: 1,
    is_own_club: false,
  };
  const data = { ...defaults, ...overrides };
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  const result = await client.query(
    `INSERT INTO teams (${cols.join(", ")}) VALUES (${placeholders}) RETURNING id`,
    vals,
  );
  return (result.rows[0] as { id: number }).id;
}

async function insertVenue(overrides: Record<string, unknown> = {}) {
  const defaults = {
    api_id: 500,
    name: "Test Venue",
    city: "Berlin",
  };
  const data = { ...defaults, ...overrides };
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  const result = await client.query(
    `INSERT INTO venues (${cols.join(", ")}) VALUES (${placeholders}) RETURNING id`,
    vals,
  );
  return (result.rows[0] as { id: number }).id;
}

async function insertMatch(overrides: Record<string, unknown> = {}) {
  const defaults = {
    api_match_id: 9000,
    match_no: 1,
    match_day: 1,
    kickoff_date: "2025-03-15",
    kickoff_time: "18:00:00",
    home_team_api_id: 1000,
    guest_team_api_id: 2000,
  };
  const data = { ...defaults, ...overrides };
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  const result = await client.query(
    `INSERT INTO matches (${cols.join(", ")}) VALUES (${placeholders}) RETURNING id`,
    vals,
  );
  return (result.rows[0] as { id: number }).id;
}

async function insertOverride(matchId: number, fieldName: string, overrides: Record<string, unknown> = {}) {
  const defaults = {
    match_id: matchId,
    field_name: fieldName,
    changed_by: "admin@test.com",
  };
  const data = { ...defaults, ...overrides };
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  await client.query(
    `INSERT INTO match_overrides (${cols.join(", ")}) VALUES (${placeholders})`,
    vals,
  );
}

async function insertRemoteVersion(matchId: number, versionNumber: number, snapshot: Record<string, unknown>) {
  await client.query(
    `INSERT INTO match_remote_versions (match_id, version_number, snapshot, data_hash) VALUES ($1, $2, $3, $4)`,
    [matchId, versionNumber, JSON.stringify(snapshot), "hash"],
  );
}

// --- Seed helpers ---

async function seedBasicData() {
  const leagueId = await insertLeague();
  await insertTeam({ api_team_permanent_id: 1000, name: "Dragons", name_short: "Herren 1", club_id: 4121, is_own_club: true });
  await insertTeam({ api_team_permanent_id: 2000, name: "Opponents", club_id: 9999 });
  const venueId = await insertVenue();
  return { leagueId, venueId };
}

async function getLocalVersion(matchId: number): Promise<number> {
  const row = await client.query(
    "SELECT current_local_version FROM matches WHERE id = $1",
    [matchId],
  );
  return (row.rows[0] as Record<string, unknown>).current_local_version as number;
}

// --- Tests ---

describe("getOwnClubMatches", () => {
  it("returns empty list when no own club teams exist", async () => {
    await insertTeam({ api_team_permanent_id: 1000, name: "Other Team" });
    await insertTeam({ api_team_permanent_id: 2000, name: "Another Team" });
    await insertMatch();

    const result = await getOwnClubMatches({ limit: 20, offset: 0 });

    expect(result).toEqual({ items: [], total: 0, limit: 20, offset: 0, hasMore: false });
  });

  it("returns matches where own club is home team", async () => {
    const { leagueId, venueId } = await seedBasicData();
    await insertMatch({ league_id: leagueId, venue_id: venueId });

    const result = await getOwnClubMatches({ limit: 20, offset: 0 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.homeTeamName).toBe("Dragons");
    expect(result.items[0]!.homeTeamNameShort).toBe("Herren 1");
    expect(result.items[0]!.guestTeamName).toBe("Opponents");
    expect(result.items[0]!.guestTeamNameShort).toBeNull();
    expect(result.items[0]!.homeIsOwnClub).toBe(true);
    expect(result.items[0]!.guestIsOwnClub).toBe(false);
    expect(result.total).toBe(1);
  });

  it("returns matches where own club is guest team", async () => {
    const { leagueId, venueId } = await seedBasicData();
    await insertMatch({
      league_id: leagueId,
      venue_id: venueId,
      home_team_api_id: 2000,
      guest_team_api_id: 1000,
    });

    const result = await getOwnClubMatches({ limit: 20, offset: 0 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.homeTeamName).toBe("Opponents");
    expect(result.items[0]!.guestTeamName).toBe("Dragons");
    expect(result.items[0]!.guestIsOwnClub).toBe(true);
  });

  it("paginates results correctly", async () => {
    await seedBasicData();
    for (let i = 0; i < 5; i++) {
      await insertMatch({
        api_match_id: 9000 + i,
        match_no: i + 1,
        kickoff_date: `2025-03-${String(10 + i).padStart(2, "0")}`,
      });
    }

    const page1 = await getOwnClubMatches({ limit: 2, offset: 0 });
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.hasMore).toBe(true);

    const page2 = await getOwnClubMatches({ limit: 2, offset: 4 });
    expect(page2.items).toHaveLength(1);
    expect(page2.hasMore).toBe(false);
  });

  it("filters by leagueId", async () => {
    const { leagueId } = await seedBasicData();
    const otherLeagueId = await insertLeague({ api_liga_id: 200, liga_nr: 2, name: "Other League" });
    await insertMatch({ api_match_id: 9001, league_id: leagueId });
    await insertMatch({ api_match_id: 9002, league_id: otherLeagueId });

    const result = await getOwnClubMatches({ limit: 20, offset: 0, leagueId: otherLeagueId });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.leagueName).toBe("Other League");
  });

  it("filters by date range", async () => {
    await seedBasicData();
    await insertMatch({ api_match_id: 9001, kickoff_date: "2025-03-01" });
    await insertMatch({ api_match_id: 9002, kickoff_date: "2025-03-15" });
    await insertMatch({ api_match_id: 9003, kickoff_date: "2025-03-30" });

    const result = await getOwnClubMatches({
      limit: 20,
      offset: 0,
      dateFrom: "2025-03-10",
      dateTo: "2025-03-20",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.kickoffDate).toBe("2025-03-15");
  });

  it("marks hasLocalChanges when currentLocalVersion > 0", async () => {
    await seedBasicData();
    await insertMatch({ api_match_id: 9001, current_local_version: 0 });
    await insertMatch({ api_match_id: 9002, current_local_version: 3 });

    const result = await getOwnClubMatches({ limit: 20, offset: 0 });

    const noChanges = result.items.find((m) => m.apiMatchId === 9001);
    const hasChanges = result.items.find((m) => m.apiMatchId === 9002);
    expect(noChanges!.hasLocalChanges).toBe(false);
    expect(hasChanges!.hasLocalChanges).toBe(true);
  });

  it("includes kampfgericht and publicComment in list items", async () => {
    await seedBasicData();
    await insertMatch({
      anschreiber: "Damen 1",
      zeitnehmer: "U16",
      shotclock: "U18",
      public_comment: "Heimspieltag",
    });

    const result = await getOwnClubMatches({ limit: 20, offset: 0 });

    expect(result.items[0]!.anschreiber).toBe("Damen 1");
    expect(result.items[0]!.zeitnehmer).toBe("U16");
    expect(result.items[0]!.shotclock).toBe("U18");
    expect(result.items[0]!.publicComment).toBe("Heimspieltag");
  });

  it("returns league and venue as null when not joined", async () => {
    await seedBasicData();
    await insertMatch();

    const result = await getOwnClubMatches({ limit: 20, offset: 0 });

    expect(result.items[0]!.leagueId).toBeNull();
    expect(result.items[0]!.leagueName).toBeNull();
    expect(result.items[0]!.venueId).toBeNull();
    expect(result.items[0]!.venueName).toBeNull();
  });

  it("orders by kickoff date ascending", async () => {
    await seedBasicData();
    await insertMatch({ api_match_id: 9001, kickoff_date: "2025-03-01" });
    await insertMatch({ api_match_id: 9002, kickoff_date: "2025-03-15" });
    await insertMatch({ api_match_id: 9003, kickoff_date: "2025-03-10" });

    const result = await getOwnClubMatches({ limit: 20, offset: 0 });

    expect(result.items.map((m) => m.kickoffDate)).toEqual([
      "2025-03-01",
      "2025-03-10",
      "2025-03-15",
    ]);
  });

  it("sorts by kickoff date descending when sort=desc", async () => {
    await seedBasicData();
    await insertMatch({ api_match_id: 9001, kickoff_date: "2025-03-01" });
    await insertMatch({ api_match_id: 9002, kickoff_date: "2025-03-15" });
    await insertMatch({ api_match_id: 9003, kickoff_date: "2025-03-10" });

    const result = await getOwnClubMatches({ limit: 20, offset: 0, sort: "desc" });

    expect(result.items.map((m) => m.kickoffDate)).toEqual([
      "2025-03-15",
      "2025-03-10",
      "2025-03-01",
    ]);
  });

  it("filters to matches with scores when hasScore=true", async () => {
    await seedBasicData();
    await insertMatch({ api_match_id: 9001, home_score: 80, guest_score: 72 });
    await insertMatch({ api_match_id: 9002 }); // no scores

    const result = await getOwnClubMatches({ limit: 20, offset: 0, hasScore: true });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.apiMatchId).toBe(9001);
  });

  it("filters to matches without scores when hasScore=false", async () => {
    await seedBasicData();
    await insertMatch({ api_match_id: 9001, home_score: 80, guest_score: 72 });
    await insertMatch({ api_match_id: 9002 }); // no scores

    const result = await getOwnClubMatches({ limit: 20, offset: 0, hasScore: false });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.apiMatchId).toBe(9002);
  });

  it("filters by teamApiId", async () => {
    await seedBasicData();
    // Add a third team
    await insertTeam({ api_team_permanent_id: 3000, name: "Third Team", club_id: 7777, is_own_club: true });
    // Match with team 1000 (home) vs 2000
    await insertMatch({ api_match_id: 9001, home_team_api_id: 1000, guest_team_api_id: 2000 });
    // Match with team 3000 (home) vs 2000
    await insertMatch({ api_match_id: 9002, home_team_api_id: 3000, guest_team_api_id: 2000 });
    // Match with team 2000 (home) vs 3000 — team 3000 is guest
    await insertMatch({ api_match_id: 9003, home_team_api_id: 2000, guest_team_api_id: 3000 });

    const result = await getOwnClubMatches({ limit: 20, offset: 0, teamApiId: 3000 });

    expect(result.items).toHaveLength(2);
    const matchIds = result.items.map((m) => m.apiMatchId).sort();
    expect(matchIds).toEqual([9002, 9003]);
  });

  it("includes overriddenFields from match_overrides", async () => {
    await seedBasicData();
    const matchId = await insertMatch();
    await insertOverride(matchId, "kickoffDate");
    await insertOverride(matchId, "isForfeited");

    const result = await getOwnClubMatches({ limit: 20, offset: 0 });

    expect(result.items[0]!.overriddenFields).toEqual(
      expect.arrayContaining(["kickoffDate", "isForfeited"]),
    );
  });
});

describe("getMatchDetail", () => {
  it("returns null for non-existent match", async () => {
    const result = await getMatchDetail(999);

    expect(result).toBeNull();
  });

  it("returns match detail with period scores", async () => {
    const { leagueId, venueId } = await seedBasicData();
    const matchId = await insertMatch({
      league_id: leagueId,
      venue_id: venueId,
      home_score: 80,
      guest_score: 72,
      period_format: "quarters",
      home_q1: 20,
      guest_q1: 18,
      home_q2: 20,
      guest_q2: 17,
    });

    const result = await getMatchDetail(matchId);

    expect(result).not.toBeNull();
    expect(result!.match.id).toBe(matchId);
    expect(result!.match.homeScore).toBe(80);
    expect(result!.match.guestScore).toBe(72);
    expect(result!.match.leagueName).toBe("Test League");
    expect(result!.match.venueName).toBe("Test Venue");
    expect(result!.match.periodFormat).toBe("quarters");
    expect(result!.match.homeQ1).toBe(20);
    expect(result!.match.guestQ1).toBe(18);
    expect(result!.diffs).toEqual([]);
  });

  it("computes local-only diffs for operational fields", async () => {
    await seedBasicData();
    const matchId = await insertMatch({
      anschreiber: "Max Mustermann",
      internal_notes: "Bring extra balls",
    });

    const result = await getMatchDetail(matchId);

    const anschreiberDiff = result!.diffs.find((d) => d.field === "anschreiber");
    expect(anschreiberDiff!.status).toBe("local-only");
    expect(anschreiberDiff!.localValue).toBe("Max Mustermann");
    expect(anschreiberDiff!.remoteValue).toBeNull();

    const notesDiff = result!.diffs.find((d) => d.field === "internalNotes");
    expect(notesDiff!.status).toBe("local-only");
  });

  it("does not include diffs for fields without overrides", async () => {
    await seedBasicData();
    const matchId = await insertMatch();

    const result = await getMatchDetail(matchId);

    expect(result!.diffs).toEqual([]);
  });

  it("includes override info in detail response", async () => {
    await seedBasicData();
    const matchId = await insertMatch({ kickoff_date: "2025-04-01" });
    await insertOverride(matchId, "kickoffDate", { reason: "Rescheduled" });

    const result = await getMatchDetail(matchId);

    expect(result!.match.overrides).toHaveLength(1);
    expect(result!.match.overrides[0]!.fieldName).toBe("kickoffDate");
    expect(result!.match.overrides[0]!.reason).toBe("Rescheduled");
    expect(result!.match.overriddenFields).toEqual(["kickoffDate"]);
  });

  it("shows diverged diff when override exists with remote snapshot", async () => {
    await seedBasicData();
    const matchId = await insertMatch({
      kickoff_date: "2025-04-01",
      current_remote_version: 1,
    });
    await insertOverride(matchId, "kickoffDate");
    await insertRemoteVersion(matchId, 1, { kickoffDate: "2025-03-15", kickoffTime: "18:00" });

    const result = await getMatchDetail(matchId);

    const dateDiff = result!.diffs.find((d) => d.field === "kickoffDate");
    expect(dateDiff).toBeDefined();
    expect(dateDiff!.status).toBe("diverged");
    expect(dateDiff!.remoteValue).toBe("2025-03-15");
    expect(dateDiff!.localValue).toBe("2025-04-01");
  });
});

describe("computeDiffs", () => {
  it("returns empty array when no overrides set", () => {
    const row = {
      kickoffDate: "2025-03-15",
      kickoffTime: "18:00:00",
      venueName: "Test Venue",
      isForfeited: false,
      isCancelled: false,
      venueNameOverride: null,
      anschreiber: null,
      zeitnehmer: null,
      shotclock: null,
      internalNotes: null,
      publicComment: null,
    } as Parameters<typeof computeDiffs>[0];

    expect(computeDiffs(row, [])).toEqual([]);
  });

  it("handles venue override diff", () => {
    const row = {
      venueNameOverride: "New Gym",
      venueName: "Test Venue",
      kickoffDate: "2025-03-15",
      kickoffTime: "18:00:00",
      isForfeited: false,
      isCancelled: false,
      anschreiber: null,
      zeitnehmer: null,
      shotclock: null,
      internalNotes: null,
      publicComment: null,
    } as Parameters<typeof computeDiffs>[0];

    const diffs = computeDiffs(row, []);
    const venueDiff = diffs.find((d) => d.field === "venue");
    expect(venueDiff!.status).toBe("diverged");
    expect(venueDiff!.localValue).toBe("New Gym");
    expect(venueDiff!.remoteValue).toBe("Test Venue");
  });

  it("uses remote snapshot values instead of row values for overridden fields", () => {
    const row = {
      kickoffDate: "2025-04-01", // overridden value in the row
      kickoffTime: "19:00:00",   // overridden value in the row
      venueName: "Test Venue",
      venueNameOverride: null,
      isForfeited: false,
      isCancelled: false,
      anschreiber: null,
      zeitnehmer: null,
      shotclock: null,
      internalNotes: null,
      publicComment: null,
    } as Parameters<typeof computeDiffs>[0];

    const remoteSnapshot = {
      kickoffDate: "2025-03-15", // original remote value
      kickoffTime: "18:00",      // original remote value
      isForfeited: false,
      isCancelled: false,
    };

    const diffs = computeDiffs(row, ["kickoffDate", "kickoffTime"], remoteSnapshot);

    const dateDiff = diffs.find((d) => d.field === "kickoffDate");
    expect(dateDiff).toBeDefined();
    expect(dateDiff!.remoteValue).toBe("2025-03-15");
    expect(dateDiff!.localValue).toBe("2025-04-01");
    expect(dateDiff!.status).toBe("diverged");

    const timeDiff = diffs.find((d) => d.field === "kickoffTime");
    expect(timeDiff).toBeDefined();
    expect(timeDiff!.remoteValue).toBe("18:00");
    expect(timeDiff!.localValue).toBe("19:00:00");
    expect(timeDiff!.status).toBe("diverged");
  });

  it("requires remoteSnapshot for correct diff when override matches row value", () => {
    const row = {
      kickoffDate: "2025-04-01",
      kickoffTime: "18:00:00",
      venueName: "Test Venue",
      venueNameOverride: null,
      isForfeited: false,
      isCancelled: false,
      anschreiber: null,
      zeitnehmer: null,
      shotclock: null,
      internalNotes: null,
      publicComment: null,
    } as Parameters<typeof computeDiffs>[0];

    const remoteSnapshot = {
      kickoffDate: "2025-03-20",
      kickoffTime: "18:00:00",
      isForfeited: false,
      isCancelled: false,
    };

    const diffs = computeDiffs(row, ["kickoffDate"], remoteSnapshot);
    const dateDiff = diffs.find((d) => d.field === "kickoffDate");
    expect(dateDiff!.remoteValue).toBe("2025-03-20");
    expect(dateDiff!.localValue).toBe("2025-04-01");
    expect(dateDiff!.status).toBe("diverged");
  });
});

describe("updateMatchLocal", () => {
  it("returns null for non-existent match", async () => {
    const result = await updateMatchLocal(999, { anschreiber: "Test" }, "admin@test.com");

    expect(result).toBeNull();
  });

  it("updates override fields and creates version + override row", async () => {
    await seedBasicData();
    const matchId = await insertMatch();

    const result = await updateMatchLocal(
      matchId,
      {
        kickoffDate: "2025-04-01",
        kickoffTime: "19:00:00",
        changeReason: "Rescheduled by email",
      },
      "admin@test.com",
    );

    expect(result).not.toBeNull();
    expect(result!.match.kickoffDate).toBe("2025-04-01");
    expect(result!.match.kickoffTime).toBe("19:00:00");
    expect(await getLocalVersion(matchId)).toBe(1);

    // Verify override rows were created
    const overrides = await client.query(
      "SELECT * FROM match_overrides WHERE match_id = $1 ORDER BY field_name",
      [matchId],
    );
    expect(overrides.rows).toHaveLength(2);
    const dateOverride = overrides.rows.find(
      (r) => (r as Record<string, unknown>).field_name === "kickoffDate",
    ) as Record<string, unknown>;
    expect(dateOverride.changed_by).toBe("admin@test.com");
    expect(dateOverride.reason).toBe("Rescheduled by email");

    // Verify version record was created
    const versions = await client.query(
      "SELECT * FROM match_local_versions WHERE match_id = $1",
      [matchId],
    );
    expect(versions.rows).toHaveLength(1);
    const version = versions.rows[0] as Record<string, unknown>;
    expect(version.version_number).toBe(1);
    expect(version.changed_by).toBe("admin@test.com");
    expect(version.change_reason).toBe("Rescheduled by email");

    // Verify change records
    const changes = await client.query(
      "SELECT * FROM match_changes WHERE match_id = $1 ORDER BY field_name",
      [matchId],
    );
    expect(changes.rows).toHaveLength(2);
    const dateChange = changes.rows.find(
      (r) => (r as Record<string, unknown>).field_name === "kickoffDate",
    ) as Record<string, unknown>;
    expect(dateChange.old_value).toBe("2025-03-15");
    expect(dateChange.new_value).toBe("2025-04-01");
    expect(dateChange.track).toBe("local");
  });

  it("clears override with null value and removes override row", async () => {
    await seedBasicData();
    // Match was overridden from "2025-03-15" to "2025-04-01"; remote version stores original
    const matchId = await insertMatch({ kickoff_date: "2025-04-01", current_remote_version: 1 });
    await insertOverride(matchId, "kickoffDate");
    await insertRemoteVersion(matchId, 1, { kickoffDate: "2025-03-15" });

    const result = await updateMatchLocal(
      matchId,
      { kickoffDate: null },
      "admin@test.com",
    );

    expect(await getLocalVersion(matchId)).toBe(1);
    // Restores remote value
    expect(result!.match.kickoffDate).toBe("2025-03-15");

    // Override row should be deleted
    const overrides = await client.query(
      "SELECT * FROM match_overrides WHERE match_id = $1",
      [matchId],
    );
    expect(overrides.rows).toHaveLength(0);
  });

  it("updates field from null to non-null value", async () => {
    await seedBasicData();
    const matchId = await insertMatch({ anschreiber: null });

    const result = await updateMatchLocal(
      matchId,
      { anschreiber: "Max" },
      "admin@test.com",
    );

    expect(result!.match.anschreiber).toBe("Max");
    expect(await getLocalVersion(matchId)).toBe(1);

    const changes = await client.query(
      "SELECT * FROM match_changes WHERE match_id = $1",
      [matchId],
    );
    expect(changes.rows).toHaveLength(1);
    const change = changes.rows[0] as Record<string, unknown>;
    expect(change.old_value).toBeNull();
    expect(change.new_value).toBe("Max");
  });

  it("clears override and removes row when remote matches current value", async () => {
    await seedBasicData();
    // Match has overridden kickoffDate, but remote already has the same value
    const matchId = await insertMatch({
      kickoff_date: "2025-03-15",
      current_remote_version: 1,
    });
    await insertOverride(matchId, "kickoffDate");
    await insertRemoteVersion(matchId, 1, { kickoffDate: "2025-03-15" });

    const result = await updateMatchLocal(
      matchId,
      { kickoffDate: null },
      "admin@test.com",
    );

    // No actual data change (remote == current), but override row should be deleted
    expect(result).not.toBeNull();
    expect(result!.match.kickoffDate).toBe("2025-03-15");

    const overrides = await client.query(
      "SELECT * FROM match_overrides WHERE match_id = $1",
      [matchId],
    );
    expect(overrides.rows).toHaveLength(0);
  });

  it("skips versioning when no actual changes", async () => {
    await seedBasicData();
    const matchId = await insertMatch({ anschreiber: "Max" });

    const result = await updateMatchLocal(
      matchId,
      { anschreiber: "Max" },
      "admin@test.com",
    );

    expect(result).not.toBeNull();
    expect(await getLocalVersion(matchId)).toBe(0);

    const versions = await client.query(
      "SELECT * FROM match_local_versions WHERE match_id = $1",
      [matchId],
    );
    expect(versions.rows).toHaveLength(0);
  });

  it("increments version on successive updates", async () => {
    await seedBasicData();
    const matchId = await insertMatch();

    await updateMatchLocal(matchId, { anschreiber: "Max" }, "admin@test.com");
    await updateMatchLocal(matchId, { zeitnehmer: "Moritz" }, "admin@test.com");

    expect(await getLocalVersion(matchId)).toBe(2);

    const versions = await client.query(
      "SELECT * FROM match_local_versions WHERE match_id = $1 ORDER BY version_number",
      [matchId],
    );
    expect(versions.rows).toHaveLength(2);
  });

  it("updates operational fields", async () => {
    await seedBasicData();
    const matchId = await insertMatch();

    const result = await updateMatchLocal(
      matchId,
      {
        anschreiber: "Max",
        zeitnehmer: "Moritz",
        shotclock: "Lisa",
        internalNotes: "Notes here",
        publicComment: "Public info",
      },
      "admin@test.com",
    );

    expect(result!.match.anschreiber).toBe("Max");
    expect(result!.match.zeitnehmer).toBe("Moritz");
    expect(result!.match.shotclock).toBe("Lisa");
    expect(result!.match.internalNotes).toBe("Notes here");
    expect(result!.match.publicComment).toBe("Public info");
  });

  it("records baseRemoteVersion in local version", async () => {
    await seedBasicData();
    const matchId = await insertMatch({ current_remote_version: 5 });

    await updateMatchLocal(matchId, { anschreiber: "Max" }, "admin@test.com");

    const versions = await client.query(
      "SELECT base_remote_version FROM match_local_versions WHERE match_id = $1",
      [matchId],
    );
    expect((versions.rows[0] as Record<string, unknown>).base_remote_version).toBe(5);
  });

  it("returns diffs after update with venue override", async () => {
    const { venueId } = await seedBasicData();
    const matchId = await insertMatch({ venue_id: venueId });

    const result = await updateMatchLocal(
      matchId,
      { venueNameOverride: "New Gym" },
      "admin@test.com",
    );

    const venueDiff = result!.diffs.find((d) => d.field === "venue");
    expect(venueDiff).toBeDefined();
    expect(venueDiff!.status).toBe("diverged");
    expect(venueDiff!.remoteValue).toBe("Test Venue");
    expect(venueDiff!.localValue).toBe("New Gym");
  });

  it("ignores fields not in data object", async () => {
    await seedBasicData();
    const matchId = await insertMatch({ anschreiber: "Max" });

    // Only update zeitnehmer, anschreiber should remain
    const result = await updateMatchLocal(
      matchId,
      { zeitnehmer: "Moritz" },
      "admin@test.com",
    );

    expect(result!.match.anschreiber).toBe("Max");
    expect(result!.match.zeitnehmer).toBe("Moritz");

    const changes = await client.query(
      "SELECT field_name FROM match_changes WHERE match_id = $1",
      [matchId],
    );
    expect(changes.rows).toHaveLength(1);
    expect((changes.rows[0] as Record<string, unknown>).field_name).toBe("zeitnehmer");
  });

  it("returns correct remote diff values after updating override fields", async () => {
    await seedBasicData();
    const matchId = await insertMatch({
      kickoff_date: "2025-03-15",
      kickoff_time: "18:00:00",
      current_remote_version: 1,
    });
    await insertRemoteVersion(matchId, 1, {
      kickoffDate: "2025-03-15",
      kickoffTime: "18:00",
      isForfeited: false,
      isCancelled: false,
    });

    const result = await updateMatchLocal(
      matchId,
      { kickoffDate: "2025-04-01" },
      "admin@test.com",
    );

    const dateDiff = result!.diffs.find((d) => d.field === "kickoffDate");
    expect(dateDiff).toBeDefined();
    expect(dateDiff!.remoteValue).toBe("2025-03-15");
    expect(dateDiff!.localValue).toBe("2025-04-01");
    expect(dateDiff!.status).toBe("diverged");
  });

  it("creates override row when setting score", async () => {
    await seedBasicData();
    const matchId = await insertMatch({ home_score: 80, guest_score: 70 });

    await updateMatchLocal(
      matchId,
      { homeScore: 85 },
      "admin@test.com",
    );

    const overrides = await client.query(
      "SELECT * FROM match_overrides WHERE match_id = $1",
      [matchId],
    );
    expect(overrides.rows).toHaveLength(1);
    expect((overrides.rows[0] as Record<string, unknown>).field_name).toBe("homeScore");
  });
});

describe("releaseOverride", () => {
  it("returns null for non-existent match", async () => {
    const result = await releaseOverride(999, "kickoffDate", "admin@test.com");
    expect(result).toBeNull();
  });

  it("returns null when no override exists", async () => {
    await seedBasicData();
    const matchId = await insertMatch();

    const result = await releaseOverride(matchId, "kickoffDate", "admin@test.com");
    expect(result).toBeNull();
  });

  it("releases override and restores remote value", async () => {
    await seedBasicData();
    const matchId = await insertMatch({
      kickoff_date: "2025-04-01",
      current_remote_version: 1,
    });
    await insertOverride(matchId, "kickoffDate");
    await insertRemoteVersion(matchId, 1, { kickoffDate: "2025-03-15" });

    const result = await releaseOverride(matchId, "kickoffDate", "admin@test.com");

    expect(result).not.toBeNull();
    expect(result!.match.kickoffDate).toBe("2025-03-15");

    // Override row should be deleted
    const overrides = await client.query(
      "SELECT * FROM match_overrides WHERE match_id = $1",
      [matchId],
    );
    expect(overrides.rows).toHaveLength(0);

    // Change should be recorded
    const changes = await client.query(
      "SELECT * FROM match_changes WHERE match_id = $1 AND field_name = 'kickoffDate'",
      [matchId],
    );
    expect(changes.rows).toHaveLength(1);
    const change = changes.rows[0] as Record<string, unknown>;
    expect(change.old_value).toBe("2025-04-01");
    expect(change.new_value).toBe("2025-03-15");
  });

  it("releases override when field is missing from remote snapshot", async () => {
    await seedBasicData();
    const matchId = await insertMatch({
      home_score: 85,
      current_remote_version: 1,
    });
    await insertOverride(matchId, "homeScore");
    // Remote snapshot doesn't include homeScore field
    await insertRemoteVersion(matchId, 1, { kickoffDate: "2025-03-15" });

    const result = await releaseOverride(matchId, "homeScore", "admin@test.com");

    expect(result).not.toBeNull();
    // Field missing in snapshot → remoteValue is null
    expect(result!.match.homeScore).toBeNull();

    const overrides = await client.query(
      "SELECT * FROM match_overrides WHERE match_id = $1",
      [matchId],
    );
    expect(overrides.rows).toHaveLength(0);
  });

  it("releases override with no remote version (restores to null)", async () => {
    await seedBasicData();
    const matchId = await insertMatch({
      home_score: 85,
      current_remote_version: 0,
    });
    await insertOverride(matchId, "homeScore");

    const result = await releaseOverride(matchId, "homeScore", "admin@test.com");

    expect(result).not.toBeNull();
    // With no remote version, remoteValue is null → score restored to null
    expect(result!.match.homeScore).toBeNull();

    const overrides = await client.query(
      "SELECT * FROM match_overrides WHERE match_id = $1",
      [matchId],
    );
    expect(overrides.rows).toHaveLength(0);
  });

  it("returns correct remote diff values after releasing override", async () => {
    await seedBasicData();
    const matchId = await insertMatch({
      kickoff_date: "2025-04-01",
      kickoff_time: "19:00:00",
      current_remote_version: 1,
    });
    await insertRemoteVersion(matchId, 1, {
      kickoffDate: "2025-03-15",
      kickoffTime: "18:00",
      isForfeited: false,
      isCancelled: false,
    });
    await insertOverride(matchId, "kickoffDate");

    const result = await releaseOverride(matchId, "kickoffDate", "admin@test.com");

    expect(result!.match.kickoffDate).toBe("2025-03-15");

    // After release, no kickoffDate diff should exist (override removed, value matches remote)
    const dateDiff = result!.diffs.find((d) => d.field === "kickoffDate");
    expect(dateDiff).toBeUndefined();
  });

  it("increments local version on release", async () => {
    await seedBasicData();
    const matchId = await insertMatch({
      kickoff_date: "2025-04-01",
      current_remote_version: 1,
      current_local_version: 3,
    });
    await insertOverride(matchId, "kickoffDate");
    await insertRemoteVersion(matchId, 1, { kickoffDate: "2025-03-15" });

    await releaseOverride(matchId, "kickoffDate", "admin@test.com");

    expect(await getLocalVersion(matchId)).toBe(4);
  });
});
