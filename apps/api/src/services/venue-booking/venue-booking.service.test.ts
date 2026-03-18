import { describe, expect, it, vi, beforeAll, beforeEach, afterAll } from "vitest";

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

vi.mock("../../config/logger", () => ({
  logger: {
    child: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
    })),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

// --- Imports (after mocks) ---

import {
  getBookingConfig,
  reconcileBookingsForMatches,
  reconcileAfterSync,
  reconcileMatch,
  previewReconciliation,
} from "./venue-booking.service";
import { setupTestDb, resetTestDb, closeTestDb, type TestDbContext } from "../../test/setup-test-db";

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

// --- Helpers ---

async function insertTeam(overrides: Record<string, unknown> = {}) {
  const defaults = {
    api_team_permanent_id: 1000,
    season_team_id: 1,
    team_competition_id: 1,
    name: "Dragons Herren 1",
    club_id: 4121,
    is_own_club: true,
  };
  const data = { ...defaults, ...overrides };
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  const result = await ctx.client.query(
    `INSERT INTO teams (${cols.join(", ")}) VALUES (${placeholders}) RETURNING id`,
    vals,
  );
  return (result.rows[0] as { id: number }).id;
}

async function insertVenue(overrides: Record<string, unknown> = {}) {
  const defaults = {
    api_id: 500,
    name: "Sporthalle Am Park",
    city: "Berlin",
  };
  const data = { ...defaults, ...overrides };
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  const result = await ctx.client.query(
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
  const result = await ctx.client.query(
    `INSERT INTO matches (${cols.join(", ")}) VALUES (${placeholders}) RETURNING id`,
    vals,
  );
  return (result.rows[0] as { id: number }).id;
}

async function insertSetting(key: string, value: string) {
  await ctx.client.query(
    "INSERT INTO app_settings (key, value) VALUES ($1, $2)",
    [key, value],
  );
}

async function insertBooking(overrides: Record<string, unknown> = {}) {
  const defaults = {
    venue_id: 1,
    date: "2025-03-15",
    calculated_start_time: "17:00:00",
    calculated_end_time: "19:30:00",
    status: "pending",
    needs_reconfirmation: false,
  };
  const data = { ...defaults, ...overrides };
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
  const result = await ctx.client.query(
    `INSERT INTO venue_bookings (${cols.join(", ")}) VALUES (${placeholders}) RETURNING id`,
    vals,
  );
  return (result.rows[0] as { id: number }).id;
}

async function insertBookingMatch(venueBookingId: number, matchId: number) {
  await ctx.client.query(
    "INSERT INTO venue_booking_matches (venue_booking_id, match_id) VALUES ($1, $2)",
    [venueBookingId, matchId],
  );
}

async function getBookings() {
  const result = await ctx.client.query("SELECT * FROM venue_bookings ORDER BY id");
  return result.rows as Record<string, unknown>[];
}

async function getBookingMatches(bookingId?: number) {
  const query = bookingId
    ? "SELECT * FROM venue_booking_matches WHERE venue_booking_id = $1 ORDER BY match_id"
    : "SELECT * FROM venue_booking_matches ORDER BY venue_booking_id, match_id";
  const params = bookingId ? [bookingId] : [];
  const result = await ctx.client.query(query, params);
  return result.rows as Record<string, unknown>[];
}

async function seedBasicTeams() {
  await insertTeam({
    api_team_permanent_id: 1000,
    name: "Dragons Herren 1",
    club_id: 4121,
    is_own_club: true,
  });
  await insertTeam({
    api_team_permanent_id: 2000,
    name: "Opponents",
    club_id: 9999,
    is_own_club: false,
  });
}

// --- Tests ---

describe("getBookingConfig", () => {
  it("returns defaults when no settings exist", async () => {
    const config = await getBookingConfig();

    expect(config).toEqual({
      bufferBeforeMinutes: 60,
      bufferAfterMinutes: 60,
      defaultGameDurationMinutes: 90,
    });
  });

  it("returns parsed values from app_settings", async () => {
    await insertSetting("venue_booking_buffer_before", "30");
    await insertSetting("venue_booking_buffer_after", "45");
    await insertSetting("venue_booking_game_duration", "120");

    const config = await getBookingConfig();

    expect(config).toEqual({
      bufferBeforeMinutes: 30,
      bufferAfterMinutes: 45,
      defaultGameDurationMinutes: 120,
    });
  });

  it("uses default for missing settings", async () => {
    await insertSetting("venue_booking_buffer_before", "30");

    const config = await getBookingConfig();

    expect(config).toEqual({
      bufferBeforeMinutes: 30,
      bufferAfterMinutes: 60,
      defaultGameDurationMinutes: 90,
    });
  });

  it("uses default for non-numeric settings", async () => {
    await insertSetting("venue_booking_buffer_before", "abc");
    await insertSetting("venue_booking_buffer_after", "");

    const config = await getBookingConfig();

    expect(config).toEqual({
      bufferBeforeMinutes: 60,
      bufferAfterMinutes: 60,
      defaultGameDurationMinutes: 90,
    });
  });
});

describe("reconcileBookingsForMatches", () => {
  it("returns empty result for empty match IDs", async () => {
    const result = await reconcileBookingsForMatches([]);

    expect(result).toEqual({ created: 0, updated: 0, removed: 0, unchanged: 0 });
  });

  it("creates a booking for a home game with venue", async () => {
    await seedBasicTeams();
    const venueId = await insertVenue();
    const matchId = await insertMatch({ venue_id: venueId });

    const result = await reconcileBookingsForMatches([matchId]);

    expect(result.created).toBe(1);

    const bookings = await getBookings();
    expect(bookings).toHaveLength(1);
    expect(bookings[0]!.venue_id).toBe(venueId);
    expect(new Date(bookings[0]!.date as string).toISOString().slice(0, 10)).toBe("2025-03-15");
    expect(bookings[0]!.status).toBe("pending");
    expect(bookings[0]!.needs_reconfirmation).toBe(false);

    // Verify junction
    const links = await getBookingMatches(bookings[0]!.id as number);
    expect(links).toHaveLength(1);
    expect(links[0]!.match_id).toBe(matchId);
  });

  it("ignores away games", async () => {
    await seedBasicTeams();
    const venueId = await insertVenue();
    // Home team is opponent (not own club)
    const matchId = await insertMatch({
      venue_id: venueId,
      home_team_api_id: 2000,
      guest_team_api_id: 1000,
    });

    const result = await reconcileBookingsForMatches([matchId]);

    expect(result).toEqual({ created: 0, updated: 0, removed: 0, unchanged: 0 });
    const bookings = await getBookings();
    expect(bookings).toHaveLength(0);
  });

  it("ignores matches without venue", async () => {
    await seedBasicTeams();
    const matchId = await insertMatch({ venue_id: null });

    const result = await reconcileBookingsForMatches([matchId]);

    expect(result).toEqual({ created: 0, updated: 0, removed: 0, unchanged: 0 });
  });

  it("groups multiple matches at same venue+date into one booking", async () => {
    await seedBasicTeams();
    const venueId = await insertVenue();
    const m1 = await insertMatch({
      api_match_id: 9001,
      venue_id: venueId,
      kickoff_time: "14:00:00",
    });
    const m2 = await insertMatch({
      api_match_id: 9002,
      venue_id: venueId,
      kickoff_time: "18:00:00",
    });

    const result = await reconcileBookingsForMatches([m1, m2]);

    expect(result.created).toBe(1);
    const bookings = await getBookings();
    expect(bookings).toHaveLength(1);

    const links = await getBookingMatches(bookings[0]!.id as number);
    expect(links).toHaveLength(2);
  });

  it("creates separate bookings for different dates", async () => {
    await seedBasicTeams();
    const venueId = await insertVenue();
    const m1 = await insertMatch({
      api_match_id: 9001,
      venue_id: venueId,
      kickoff_date: "2025-03-15",
    });
    const m2 = await insertMatch({
      api_match_id: 9002,
      venue_id: venueId,
      kickoff_date: "2025-03-22",
    });

    const result = await reconcileBookingsForMatches([m1, m2]);

    expect(result.created).toBe(2);
    const bookings = await getBookings();
    expect(bookings).toHaveLength(2);
  });

  it("creates separate bookings for different venues on same date", async () => {
    await seedBasicTeams();
    const venue1 = await insertVenue({ api_id: 501, name: "Venue A" });
    const venue2 = await insertVenue({ api_id: 502, name: "Venue B" });
    const m1 = await insertMatch({
      api_match_id: 9001,
      venue_id: venue1,
    });
    const m2 = await insertMatch({
      api_match_id: 9002,
      venue_id: venue2,
    });

    const result = await reconcileBookingsForMatches([m1, m2]);

    expect(result.created).toBe(2);
  });

  it("updates existing booking when time window changes", async () => {
    await seedBasicTeams();
    const venueId = await insertVenue();
    const matchId = await insertMatch({
      venue_id: venueId,
      kickoff_time: "18:00:00",
    });

    // Create an existing booking with different times
    const bookingId = await insertBooking({
      venue_id: venueId,
      date: "2025-03-15",
      calculated_start_time: "16:00:00",
      calculated_end_time: "18:00:00",
    });
    await insertBookingMatch(bookingId, matchId);

    const result = await reconcileBookingsForMatches([matchId]);

    expect(result.updated).toBe(1);
    expect(result.created).toBe(0);

    const bookings = await getBookings();
    expect(bookings).toHaveLength(1);
    // Time should be updated to calculated values based on 18:00 kickoff with default config
    // Start: 18:00 - 60 = 17:00, End: 18:00 + 90 + 60 = 20:30
    expect(bookings[0]!.calculated_start_time).toBe("17:00:00");
    expect(bookings[0]!.calculated_end_time).toBe("20:30:00");
  });

  it("marks unchanged booking when time window stays the same", async () => {
    await seedBasicTeams();
    const venueId = await insertVenue();
    const matchId = await insertMatch({
      venue_id: venueId,
      kickoff_time: "18:00:00",
    });

    // Create existing booking with correct times for default config
    // Start: 18:00 - 60 = 17:00, End: 18:00 + 90 + 60 = 20:30
    const bookingId = await insertBooking({
      venue_id: venueId,
      date: "2025-03-15",
      calculated_start_time: "17:00:00",
      calculated_end_time: "20:30:00",
    });
    await insertBookingMatch(bookingId, matchId);

    const result = await reconcileBookingsForMatches([matchId]);

    expect(result.unchanged).toBe(1);
    expect(result.updated).toBe(0);
  });

  it("reverts confirmed booking to pending with reconfirmation when window changes", async () => {
    await seedBasicTeams();
    const venueId = await insertVenue();
    const matchId = await insertMatch({
      venue_id: venueId,
      kickoff_time: "18:00:00",
    });

    const bookingId = await insertBooking({
      venue_id: venueId,
      date: "2025-03-15",
      calculated_start_time: "16:00:00",
      calculated_end_time: "18:00:00",
      status: "confirmed",
      needs_reconfirmation: false,
      confirmed_at: "2025-03-01T12:00:00Z",
      confirmed_by: "admin-user",
    });
    await insertBookingMatch(bookingId, matchId);

    const result = await reconcileBookingsForMatches([matchId]);

    expect(result.updated).toBe(1);

    const bookings = await getBookings();
    expect(bookings[0]!.needs_reconfirmation).toBe(true);
    expect(bookings[0]!.status).toBe("pending");
    expect(bookings[0]!.confirmed_at).toBeNull();
    expect(bookings[0]!.confirmed_by).toBeNull();
  });

  it("preserves existing needsReconfirmation if already true for non-confirmed", async () => {
    await seedBasicTeams();
    const venueId = await insertVenue();
    const matchId = await insertMatch({
      venue_id: venueId,
      kickoff_time: "18:00:00",
    });

    const bookingId = await insertBooking({
      venue_id: venueId,
      date: "2025-03-15",
      calculated_start_time: "16:00:00",
      calculated_end_time: "18:00:00",
      status: "pending",
      needs_reconfirmation: true,
    });
    await insertBookingMatch(bookingId, matchId);

    await reconcileBookingsForMatches([matchId]);

    const bookings = await getBookings();
    expect(bookings[0]!.needs_reconfirmation).toBe(true);
  });

  it("does not set needsReconfirmation for pending booking with window change", async () => {
    await seedBasicTeams();
    const venueId = await insertVenue();
    const matchId = await insertMatch({
      venue_id: venueId,
      kickoff_time: "18:00:00",
    });

    const bookingId = await insertBooking({
      venue_id: venueId,
      date: "2025-03-15",
      calculated_start_time: "16:00:00",
      calculated_end_time: "18:00:00",
      status: "pending",
      needs_reconfirmation: false,
    });
    await insertBookingMatch(bookingId, matchId);

    await reconcileBookingsForMatches([matchId]);

    const bookings = await getBookings();
    expect(bookings[0]!.needs_reconfirmation).toBe(false);
  });

  it("adds new junction entries for newly linked matches", async () => {
    await seedBasicTeams();
    const venueId = await insertVenue();
    const m1 = await insertMatch({
      api_match_id: 9001,
      venue_id: venueId,
      kickoff_time: "14:00:00",
    });

    // Create booking with m1
    const bookingId = await insertBooking({
      venue_id: venueId,
      date: "2025-03-15",
      calculated_start_time: "13:00:00",
      calculated_end_time: "16:30:00",
    });
    await insertBookingMatch(bookingId, m1);

    // Add a second match at the same venue+date
    const m2 = await insertMatch({
      api_match_id: 9002,
      venue_id: venueId,
      kickoff_time: "18:00:00",
    });

    await reconcileBookingsForMatches([m1, m2]);

    const links = await getBookingMatches(bookingId);
    expect(links).toHaveLength(2);
  });

  it("removes stale junction entries when match moves away", async () => {
    await seedBasicTeams();
    const venue1 = await insertVenue({ api_id: 501, name: "Venue A" });
    const venue2 = await insertVenue({ api_id: 502, name: "Venue B" });

    const m1 = await insertMatch({
      api_match_id: 9001,
      venue_id: venue1,
    });
    const m2 = await insertMatch({
      api_match_id: 9002,
      venue_id: venue1,
    });

    // Both linked to venue1 booking
    const bookingId = await insertBooking({
      venue_id: venue1,
      date: "2025-03-15",
      calculated_start_time: "17:00:00",
      calculated_end_time: "20:30:00",
    });
    await insertBookingMatch(bookingId, m1);
    await insertBookingMatch(bookingId, m2);

    // Now m2 moves to venue2
    await ctx.client.query("UPDATE matches SET venue_id = $1 WHERE id = $2", [venue2, m2]);

    await reconcileBookingsForMatches([m1, m2]);

    // venue1 booking should only have m1
    const venue1Links = await getBookingMatches(bookingId);
    expect(venue1Links).toHaveLength(1);
    expect(venue1Links[0]!.match_id).toBe(m1);
  });

  it("deletes empty bookings after stale match removal", async () => {
    await seedBasicTeams();
    const venueId = await insertVenue();

    const matchId = await insertMatch({
      venue_id: venueId,
    });

    // Create booking with the match
    const bookingId = await insertBooking({
      venue_id: venueId,
      date: "2025-03-15",
      calculated_start_time: "17:00:00",
      calculated_end_time: "20:30:00",
    });
    await insertBookingMatch(bookingId, matchId);

    // Now change the match to not be a home game (change home team to away team)
    await ctx.client.query(
      "UPDATE matches SET home_team_api_id = $1, guest_team_api_id = $2 WHERE id = $3",
      [2000, 1000, matchId],
    );

    const result = await reconcileBookingsForMatches([matchId]);

    expect(result.removed).toBe(1);
    const bookings = await getBookings();
    expect(bookings).toHaveLength(0);
  });

  it("keeps stale booking when other matches remain linked", async () => {
    await seedBasicTeams();
    const venueId = await insertVenue();

    // Two matches at same venue+date
    const m1 = await insertMatch({
      api_match_id: 9001,
      venue_id: venueId,
      kickoff_time: "14:00:00",
    });
    const m2 = await insertMatch({
      api_match_id: 9002,
      venue_id: venueId,
      kickoff_time: "18:00:00",
    });

    // Booking with both matches
    const bookingId = await insertBooking({
      venue_id: venueId,
      date: "2025-03-15",
      calculated_start_time: "13:00:00",
      calculated_end_time: "20:30:00",
    });
    await insertBookingMatch(bookingId, m1);
    await insertBookingMatch(bookingId, m2);

    // Change m1 to no longer be a home game
    await ctx.client.query(
      "UPDATE matches SET home_team_api_id = $1, guest_team_api_id = $2 WHERE id = $3",
      [2000, 1000, m1],
    );

    // Only reconcile m1 — m2 is not in the set
    const result = await reconcileBookingsForMatches([m1]);

    // Booking should NOT be deleted because m2 still links to it
    expect(result.removed).toBe(0);
    const bookings = await getBookings();
    expect(bookings).toHaveLength(1);

    // m1 should be removed from the junction, m2 still linked
    const links = await getBookingMatches(bookingId);
    expect(links).toHaveLength(1);
    expect(links[0]!.match_id).toBe(m2);
  });

  it("uses team estimatedGameDuration when available", async () => {
    await insertTeam({
      api_team_permanent_id: 1000,
      name: "Dragons U12",
      club_id: 4121,
      is_own_club: true,
      estimated_game_duration: 50,
    });
    await insertTeam({
      api_team_permanent_id: 2000,
      name: "Opponents",
      club_id: 9999,
      is_own_club: false,
    });
    const venueId = await insertVenue();
    const matchId = await insertMatch({
      venue_id: venueId,
      kickoff_time: "14:00:00",
    });

    await reconcileBookingsForMatches([matchId]);

    const bookings = await getBookings();
    // Start: 14:00 - 60 = 13:00, End: 14:00 + 50 + 60 = 15:50
    expect(bookings[0]!.calculated_start_time).toBe("13:00:00");
    expect(bookings[0]!.calculated_end_time).toBe("15:50:00");
  });

  it("reads booking config from app_settings", async () => {
    await seedBasicTeams();
    await insertSetting("venue_booking_buffer_before", "30");
    await insertSetting("venue_booking_buffer_after", "15");
    await insertSetting("venue_booking_game_duration", "120");

    const venueId = await insertVenue();
    const matchId = await insertMatch({
      venue_id: venueId,
      kickoff_time: "14:00:00",
    });

    await reconcileBookingsForMatches([matchId]);

    const bookings = await getBookings();
    // Start: 14:00 - 30 = 13:30, End: 14:00 + 120 + 15 = 16:15
    expect(bookings[0]!.calculated_start_time).toBe("13:30:00");
    expect(bookings[0]!.calculated_end_time).toBe("16:15:00");
  });

  it("handles match IDs that do not exist", async () => {
    const result = await reconcileBookingsForMatches([9999]);

    expect(result).toEqual({ created: 0, updated: 0, removed: 0, unchanged: 0 });
  });
});

describe("reconcileAfterSync", () => {
  it("reconciles all home matches with venues", async () => {
    await seedBasicTeams();
    const venueId = await insertVenue();
    await insertMatch({
      api_match_id: 9001,
      venue_id: venueId,
      kickoff_date: "2025-03-15",
    });
    await insertMatch({
      api_match_id: 9002,
      venue_id: venueId,
      kickoff_date: "2025-03-22",
    });

    await reconcileAfterSync();

    const bookings = await getBookings();
    expect(bookings).toHaveLength(2);
  });

  it("skips away matches", async () => {
    await seedBasicTeams();
    const venueId = await insertVenue();
    // Away game only
    await insertMatch({
      venue_id: venueId,
      home_team_api_id: 2000,
      guest_team_api_id: 1000,
    });

    await reconcileAfterSync();

    const bookings = await getBookings();
    expect(bookings).toHaveLength(0);
  });

  it("does nothing when no home matches exist", async () => {
    // No teams, no matches
    await reconcileAfterSync();

    const bookings = await getBookings();
    expect(bookings).toHaveLength(0);
  });

  it("skips matches without venues", async () => {
    await seedBasicTeams();
    await insertMatch({ venue_id: null });

    await reconcileAfterSync();

    const bookings = await getBookings();
    expect(bookings).toHaveLength(0);
  });
});

describe("reconcileMatch", () => {
  it("creates booking for a single match", async () => {
    await seedBasicTeams();
    const venueId = await insertVenue();
    const matchId = await insertMatch({ venue_id: venueId });

    await reconcileMatch(matchId);

    const bookings = await getBookings();
    expect(bookings).toHaveLength(1);
  });

  it("cleans up old booking when match moves to different date", async () => {
    await seedBasicTeams();
    const venueId = await insertVenue();
    const matchId = await insertMatch({
      venue_id: venueId,
      kickoff_date: "2025-03-15",
    });

    // Create initial booking
    const oldBookingId = await insertBooking({
      venue_id: venueId,
      date: "2025-03-15",
      calculated_start_time: "17:00:00",
      calculated_end_time: "20:30:00",
    });
    await insertBookingMatch(oldBookingId, matchId);

    // Now the match date changes
    await ctx.client.query(
      "UPDATE matches SET kickoff_date = '2025-03-22' WHERE id = $1",
      [matchId],
    );

    await reconcileMatch(matchId);

    const bookings = await getBookings();
    // Old booking should be deleted (was only match), new booking created
    expect(bookings).toHaveLength(1);
    expect(new Date(bookings[0]!.date as string).toISOString().slice(0, 10)).toBe("2025-03-22");
  });

  it("cleans up old booking when match moves to different venue", async () => {
    await seedBasicTeams();
    const venue1 = await insertVenue({ api_id: 501, name: "Venue A" });
    const venue2 = await insertVenue({ api_id: 502, name: "Venue B" });

    const matchId = await insertMatch({
      venue_id: venue1,
    });

    // Create initial booking at venue1
    const oldBookingId = await insertBooking({
      venue_id: venue1,
      date: "2025-03-15",
      calculated_start_time: "17:00:00",
      calculated_end_time: "20:30:00",
    });
    await insertBookingMatch(oldBookingId, matchId);

    // Now the match moves to venue2
    await ctx.client.query(
      "UPDATE matches SET venue_id = $1 WHERE id = $2",
      [venue2, matchId],
    );

    await reconcileMatch(matchId);

    const bookings = await getBookings();
    // Old booking at venue1 deleted, new booking at venue2 created
    expect(bookings).toHaveLength(1);
    expect(bookings[0]!.venue_id).toBe(venue2);
  });

  it("keeps old booking if other matches still linked to it", async () => {
    await seedBasicTeams();
    const venue1 = await insertVenue({ api_id: 501, name: "Venue A" });
    const venue2 = await insertVenue({ api_id: 502, name: "Venue B" });

    const m1 = await insertMatch({
      api_match_id: 9001,
      venue_id: venue1,
      kickoff_time: "14:00:00",
    });
    const m2 = await insertMatch({
      api_match_id: 9002,
      venue_id: venue1,
      kickoff_time: "18:00:00",
    });

    // Both in same booking at venue1
    const bookingId = await insertBooking({
      venue_id: venue1,
      date: "2025-03-15",
      calculated_start_time: "13:00:00",
      calculated_end_time: "20:30:00",
    });
    await insertBookingMatch(bookingId, m1);
    await insertBookingMatch(bookingId, m2);

    // Move m2 to venue2
    await ctx.client.query(
      "UPDATE matches SET venue_id = $1 WHERE id = $2",
      [venue2, m2],
    );

    await reconcileMatch(m2);

    const bookings = await getBookings();
    // venue1 booking still exists (has m1), plus new booking at venue2
    expect(bookings).toHaveLength(2);

    // venue1 booking should only have m1
    const venue1Booking = bookings.find((b) => b.venue_id === venue1);
    expect(venue1Booking).toBeDefined();
    const links = await getBookingMatches(venue1Booking!.id as number);
    expect(links).toHaveLength(1);
    expect(links[0]!.match_id).toBe(m1);
  });

  it("handles non-existent match gracefully", async () => {
    await reconcileMatch(9999);

    const bookings = await getBookings();
    expect(bookings).toHaveLength(0);
  });

  it("handles match with no previous links", async () => {
    await seedBasicTeams();
    const venueId = await insertVenue();
    const matchId = await insertMatch({ venue_id: venueId });

    // No pre-existing bookings
    await reconcileMatch(matchId);

    const bookings = await getBookings();
    expect(bookings).toHaveLength(1);
  });

  it("does not clean up when match stays at same venue+date", async () => {
    await seedBasicTeams();
    const venueId = await insertVenue();
    const matchId = await insertMatch({ venue_id: venueId });

    const bookingId = await insertBooking({
      venue_id: venueId,
      date: "2025-03-15",
      calculated_start_time: "17:00:00",
      calculated_end_time: "20:30:00",
    });
    await insertBookingMatch(bookingId, matchId);

    await reconcileMatch(matchId);

    const bookings = await getBookings();
    expect(bookings).toHaveLength(1);
    expect(bookings[0]!.id).toBe(bookingId);
  });
});

describe("previewReconciliation", () => {
  it("returns empty preview when no home matches exist", async () => {
    const preview = await previewReconciliation();

    expect(preview).toEqual({
      toCreate: [],
      toUpdate: [],
      toRemove: [],
      unchanged: 0,
    });
  });

  it("returns toCreate for new bookings needed", async () => {
    await seedBasicTeams();
    const venueId = await insertVenue();
    await insertMatch({ venue_id: venueId });

    const preview = await previewReconciliation();

    expect(preview.toCreate).toHaveLength(1);
    expect(preview.toUpdate).toHaveLength(0);
    expect(preview.toRemove).toHaveLength(0);
    expect(preview.unchanged).toBe(0);

    const item = preview.toCreate[0]!;
    expect(item.venueName).toBe("Sporthalle Am Park");
    expect(item.date).toBe("2025-03-15");
    expect(item.calculatedStartTime).toBe("17:00:00");
    expect(item.calculatedEndTime).toBe("20:30:00");
    expect(item.matches).toHaveLength(1);
    expect(item.matches[0]!.homeTeam).toBe("Dragons Herren 1");
    expect(item.matches[0]!.guestTeam).toBe("Opponents");
    expect(item.matches[0]!.kickoffTime).toBe("18:00:00");
    expect(item.matches[0]!.isForfeited).toBe(false);
    expect(item.matches[0]!.isCancelled).toBe(false);
  });

  it("returns toUpdate when time window changed for existing booking", async () => {
    await seedBasicTeams();
    const venueId = await insertVenue();
    const matchId = await insertMatch({ venue_id: venueId, kickoff_time: "18:00:00" });

    const bookingId = await insertBooking({
      venue_id: venueId,
      date: "2025-03-15",
      calculated_start_time: "16:00:00",
      calculated_end_time: "18:00:00",
    });
    await insertBookingMatch(bookingId, matchId);

    const preview = await previewReconciliation();

    expect(preview.toCreate).toHaveLength(0);
    expect(preview.toUpdate).toHaveLength(1);
    expect(preview.toRemove).toHaveLength(0);
    expect(preview.unchanged).toBe(0);

    const item = preview.toUpdate[0]!;
    expect(item.bookingId).toBe(bookingId);
    expect(item.currentStartTime).toBe("16:00:00");
    expect(item.currentEndTime).toBe("18:00:00");
    expect(item.newStartTime).toBe("17:00:00");
    expect(item.newEndTime).toBe("20:30:00");
  });

  it("returns toRemove for bookings with all matches cancelled", async () => {
    await seedBasicTeams();
    const venueId = await insertVenue();
    const matchId = await insertMatch({
      venue_id: venueId,
      is_cancelled: true,
    });

    const bookingId = await insertBooking({
      venue_id: venueId,
      date: "2025-03-15",
      calculated_start_time: "17:00:00",
      calculated_end_time: "20:30:00",
    });
    await insertBookingMatch(bookingId, matchId);

    const preview = await previewReconciliation();

    expect(preview.toCreate).toHaveLength(0);
    expect(preview.toUpdate).toHaveLength(0);
    expect(preview.toRemove).toHaveLength(1);
    expect(preview.unchanged).toBe(0);

    const item = preview.toRemove[0]!;
    expect(item.bookingId).toBe(bookingId);
    expect(item.reason).toBe("all_matches_cancelled");
    expect(item.matches).toHaveLength(1);
    expect(item.matches[0]!.isCancelled).toBe(true);
  });

  it("returns toRemove for orphaned bookings with no matching matches", async () => {
    await seedBasicTeams();
    const venue1 = await insertVenue({ api_id: 501, name: "Venue A" });
    const venue2 = await insertVenue({ api_id: 502, name: "Venue B" });

    // A real home match at venue1 so the function does not return early
    await insertMatch({ venue_id: venue1 });

    // An orphaned booking at venue2 with no corresponding home matches
    const orphanedBookingId = await insertBooking({
      venue_id: venue2,
      date: "2025-04-01",
      calculated_start_time: "17:00:00",
      calculated_end_time: "20:30:00",
    });

    const preview = await previewReconciliation();

    // venue1 match should be in toCreate, orphaned booking at venue2 should be in toRemove
    expect(preview.toCreate).toHaveLength(1);
    expect(preview.toRemove).toHaveLength(1);
    expect(preview.toRemove[0]!.bookingId).toBe(orphanedBookingId);
    expect(preview.toRemove[0]!.reason).toBe("no_matches");
  });

  it("increments unchanged for matching bookings", async () => {
    await seedBasicTeams();
    const venueId = await insertVenue();
    const matchId = await insertMatch({ venue_id: venueId, kickoff_time: "18:00:00" });

    // Create booking with correct calculated times (default config: -60, +90+60)
    const bookingId = await insertBooking({
      venue_id: venueId,
      date: "2025-03-15",
      calculated_start_time: "17:00:00",
      calculated_end_time: "20:30:00",
    });
    await insertBookingMatch(bookingId, matchId);

    const preview = await previewReconciliation();

    expect(preview.toCreate).toHaveLength(0);
    expect(preview.toUpdate).toHaveLength(0);
    expect(preview.toRemove).toHaveLength(0);
    expect(preview.unchanged).toBe(1);
  });

  it("returns toUpdate when matches added to existing booking", async () => {
    await seedBasicTeams();
    const venueId = await insertVenue();
    const m1 = await insertMatch({
      api_match_id: 9001,
      venue_id: venueId,
      kickoff_time: "14:00:00",
    });
    const m2 = await insertMatch({
      api_match_id: 9002,
      venue_id: venueId,
      kickoff_time: "18:00:00",
    });

    // Booking only linked to m1
    const bookingId = await insertBooking({
      venue_id: venueId,
      date: "2025-03-15",
      calculated_start_time: "13:00:00",
      calculated_end_time: "16:30:00",
    });
    await insertBookingMatch(bookingId, m1);

    const preview = await previewReconciliation();

    expect(preview.toUpdate).toHaveLength(1);
    const item = preview.toUpdate[0]!;
    expect(item.bookingId).toBe(bookingId);
    expect(item.matchesAdded).toHaveLength(1);
    expect(item.matchesAdded[0]!.id).toBe(m2);
    expect(item.matchesRemoved).toHaveLength(0);
  });

  it("returns toUpdate when matches removed from existing booking", async () => {
    await seedBasicTeams();
    const venueId = await insertVenue();
    const m1 = await insertMatch({
      api_match_id: 9001,
      venue_id: venueId,
      kickoff_time: "14:00:00",
    });
    // m2 is an away game at the same venue+date (home team is opponent)
    const m2 = await insertMatch({
      api_match_id: 9002,
      venue_id: venueId,
      kickoff_time: "18:00:00",
      home_team_api_id: 2000,
      guest_team_api_id: 1000,
    });

    // Booking linked to both m1 and m2
    const bookingId = await insertBooking({
      venue_id: venueId,
      date: "2025-03-15",
      calculated_start_time: "13:00:00",
      calculated_end_time: "20:30:00",
    });
    await insertBookingMatch(bookingId, m1);
    await insertBookingMatch(bookingId, m2);

    const preview = await previewReconciliation();

    expect(preview.toUpdate).toHaveLength(1);
    const item = preview.toUpdate[0]!;
    expect(item.bookingId).toBe(bookingId);
    expect(item.matchesRemoved).toHaveLength(1);
    expect(item.matchesRemoved[0]!.id).toBe(m2);
  });
});

describe("reconcileBookingsForMatches — forfeited/cancelled handling", () => {
  it("removes booking when all matches are forfeited", async () => {
    await seedBasicTeams();
    const venueId = await insertVenue();
    const matchId = await insertMatch({
      venue_id: venueId,
      is_forfeited: true,
    });

    const bookingId = await insertBooking({
      venue_id: venueId,
      date: "2025-03-15",
      calculated_start_time: "17:00:00",
      calculated_end_time: "20:30:00",
    });
    await insertBookingMatch(bookingId, matchId);

    const result = await reconcileBookingsForMatches([matchId]);

    expect(result.removed).toBe(1);
    const bookings = await getBookings();
    expect(bookings).toHaveLength(0);
    const links = await getBookingMatches();
    expect(links).toHaveLength(0);
  });

  it("removes booking when all matches are cancelled", async () => {
    await seedBasicTeams();
    const venueId = await insertVenue();
    const matchId = await insertMatch({
      venue_id: venueId,
      is_cancelled: true,
    });

    const bookingId = await insertBooking({
      venue_id: venueId,
      date: "2025-03-15",
      calculated_start_time: "17:00:00",
      calculated_end_time: "20:30:00",
    });
    await insertBookingMatch(bookingId, matchId);

    const result = await reconcileBookingsForMatches([matchId]);

    expect(result.removed).toBe(1);
    const bookings = await getBookings();
    expect(bookings).toHaveLength(0);
    const links = await getBookingMatches();
    expect(links).toHaveLength(0);
  });

  it("keeps booking junction entries for remaining active matches when some are forfeited", async () => {
    await seedBasicTeams();
    const venueId = await insertVenue();
    const activeMatch = await insertMatch({
      api_match_id: 9001,
      venue_id: venueId,
      kickoff_time: "14:00:00",
    });
    const forfeitedMatch = await insertMatch({
      api_match_id: 9002,
      venue_id: venueId,
      kickoff_time: "18:00:00",
      is_forfeited: true,
    });

    const bookingId = await insertBooking({
      venue_id: venueId,
      date: "2025-03-15",
      calculated_start_time: "13:00:00",
      calculated_end_time: "20:30:00",
    });
    await insertBookingMatch(bookingId, activeMatch);
    await insertBookingMatch(bookingId, forfeitedMatch);

    const result = await reconcileBookingsForMatches([activeMatch, forfeitedMatch]);

    // Booking should still exist (has active match)
    expect(result.removed).toBe(0);
    const bookings = await getBookings();
    expect(bookings).toHaveLength(1);

    // Only the active match should remain in the junction
    const links = await getBookingMatches(bookingId);
    expect(links).toHaveLength(1);
    expect(links[0]!.match_id).toBe(activeMatch);
  });
});
