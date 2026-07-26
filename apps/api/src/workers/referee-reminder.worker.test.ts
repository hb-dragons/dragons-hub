import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { EVENT_TYPES } from "@dragons/shared";

// --- Mock setup ---
//
// drizzle-orm is NOT mocked here. The one query this worker makes is
// `and(eq(refereeGames.id, refereeGameId), isNull(refereeGames.removedAt))` —
// the second half being the #105 guard that stops a withdrawn game from firing a
// reminder whose job outlived the cancellation. With `eq`/`and`/`isNull` stubbed
// to bare `vi.fn()` the select resolves to whatever the test handed it and the
// guard is unobservable, so this runs against a real (PGlite, in-process)
// Postgres and seeds the rows it wants matched or skipped.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

vi.mock("../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
}));

const mockChildLogger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  child: vi.fn().mockReturnThis(),
}));

vi.mock("../config/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    child: vi.fn().mockReturnValue(mockChildLogger),
  },
}));

vi.mock("../config/env", () => ({
  env: { REDIS_URL: "redis://localhost:6379" },
}));

const mockPublishDomainEvent = vi.fn();
vi.mock("../services/events/event-publisher", () => ({
  publishDomainEvent: (...args: unknown[]) => mockPublishDomainEvent(...args),
}));

// Capture the processor function from the Worker constructor
let processorFn: (job: unknown) => Promise<unknown>;

vi.mock("bullmq", () => ({
  Worker: class MockWorker {
    constructor(_name: string, processor: (job: unknown) => Promise<unknown>) {
      processorFn = processor;
    }
    on() {
      return this;
    }
  },
}));

// Import after all mocks are registered
const { shouldEmitReminder } = await import("./referee-reminder.worker");

import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../test/setup-test-db";

let ctx: TestDbContext;

beforeAll(async () => {
  // This machine runs Europe/Berlin; the API container runs UTC. Kickoff date
  // and time are `date`/`time` columns that must round-trip as wall-clock
  // strings regardless of the process zone, so pin a non-Berlin zone and let a
  // silent Date coercion show up as a shifted value.
  vi.stubEnv("TZ", "UTC");
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

beforeEach(async () => {
  await resetTestDb(ctx);
  vi.clearAllMocks();
  mockPublishDomainEvent.mockResolvedValue(undefined);
});

afterAll(async () => {
  await closeTestDb(ctx);
  vi.unstubAllEnvs();
});

// --- Test fixtures ---

interface GameInput {
  apiMatchId?: number;
  matchId?: number | null;
  matchNo?: number;
  kickoffDate?: string;
  kickoffTime?: string;
  homeTeamName?: string;
  guestTeamName?: string;
  leagueName?: string | null;
  venueName?: string | null;
  isCancelled?: boolean;
  isForfeited?: boolean;
  sr1Status?: string;
  sr1Name?: string | null;
  sr1OurClub?: boolean;
  sr2Status?: string;
  sr2Name?: string | null;
  sr2OurClub?: boolean;
  removedAt?: Date | null;
}

/** Insert a referee_games row and return its serial id. */
async function seedGame(input: GameInput = {}): Promise<number> {
  const r = await ctx.client.query<{ id: number }>(
    `INSERT INTO referee_games
       (api_match_id, match_id, match_no, kickoff_date, kickoff_time,
        home_team_name, guest_team_name, league_name, venue_name,
        sr1_our_club, sr2_our_club, sr1_name, sr2_name, sr1_status, sr2_status,
        is_cancelled, is_forfeited, removed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     RETURNING id`,
    [
      input.apiMatchId ?? 12345,
      input.matchId === undefined ? null : input.matchId,
      input.matchNo ?? 100,
      input.kickoffDate ?? "2026-04-20",
      input.kickoffTime ?? "15:00:00",
      input.homeTeamName ?? "Dragons",
      input.guestTeamName ?? "Tigers",
      input.leagueName === undefined ? "Bezirksliga" : input.leagueName,
      input.venueName === undefined ? "Halle A" : input.venueName,
      input.sr1OurClub ?? true,
      input.sr2OurClub ?? true,
      input.sr1Name ?? null,
      input.sr2Name ?? null,
      input.sr1Status ?? "open",
      input.sr2Status ?? "open",
      input.isCancelled ?? false,
      input.isForfeited ?? false,
      input.removedAt ?? null,
    ],
  );
  return r.rows[0]!.id;
}

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    data: {
      apiMatchId: 12345,
      refereeGameId: 1,
      reminderDays: 3,
      ...overrides,
    },
  };
}

// --- Tests ---

describe("shouldEmitReminder", () => {
  it("returns true when both slots are unfilled", () => {
    expect(shouldEmitReminder({
      isCancelled: false,
      isForfeited: false,
      sr1Assigned: null,
      sr2Assigned: null,
    })).toBe(true);
  });

  it("returns true when one slot is unfilled", () => {
    expect(shouldEmitReminder({
      isCancelled: false,
      isForfeited: false,
      sr1Assigned: "Max",
      sr2Assigned: null,
    })).toBe(true);
  });

  it("returns false when both slots are filled", () => {
    expect(shouldEmitReminder({
      isCancelled: false,
      isForfeited: false,
      sr1Assigned: "Max",
      sr2Assigned: "Erika",
    })).toBe(false);
  });

  it("returns false when match is cancelled", () => {
    expect(shouldEmitReminder({
      isCancelled: true,
      isForfeited: false,
      sr1Assigned: null,
      sr2Assigned: null,
    })).toBe(false);
  });

  it("returns false when match is forfeited", () => {
    expect(shouldEmitReminder({
      isCancelled: false,
      isForfeited: true,
      sr1Assigned: null,
      sr2Assigned: null,
    })).toBe(false);
  });
});

describe("referee reminder worker processor", () => {
  it("skips when no game with that id exists", async () => {
    const result = await processorFn(makeJob({ refereeGameId: 999 }));

    expect(result).toEqual({ skipped: true, reason: "game_not_found" });
    expect(mockPublishDomainEvent).not.toHaveBeenCalled();
  });

  it("loads the game named by the job, not some other open game", async () => {
    await seedGame({ apiMatchId: 111, homeTeamName: "Wrong", guestTeamName: "Game" });
    const wanted = await seedGame({
      apiMatchId: 222,
      homeTeamName: "Dragons",
      guestTeamName: "Tigers",
    });

    await processorFn(makeJob({ refereeGameId: wanted, apiMatchId: 222 }));

    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 222, entityName: "Dragons vs Tigers" }),
    );
  });

  it("skips a withdrawn game whose reminder job outlived the cancellation (#105)", async () => {
    const id = await seedGame({ removedAt: new Date("2026-04-01T09:00:00Z") });

    const result = await processorFn(makeJob({ refereeGameId: id }));

    expect(result).toEqual({ skipped: true, reason: "game_not_found" });
    expect(mockPublishDomainEvent).not.toHaveBeenCalled();
  });

  it("skips when both slots are filled", async () => {
    const id = await seedGame({
      sr1Status: "assigned",
      sr1Name: "Max",
      sr2Status: "assigned",
      sr2Name: "Erika",
    });

    const result = await processorFn(makeJob({ refereeGameId: id }));

    expect(result).toEqual({ skipped: true, reason: "not_needed" });
    expect(mockPublishDomainEvent).not.toHaveBeenCalled();
  });

  it("skips when match is cancelled", async () => {
    const id = await seedGame({ isCancelled: true });

    const result = await processorFn(makeJob({ refereeGameId: id }));

    expect(result).toEqual({ skipped: true, reason: "not_needed" });
    expect(mockPublishDomainEvent).not.toHaveBeenCalled();
  });

  it("skips when match is forfeited", async () => {
    const id = await seedGame({ isForfeited: true });

    const result = await processorFn(makeJob({ refereeGameId: id }));

    expect(result).toEqual({ skipped: true, reason: "not_needed" });
    expect(mockPublishDomainEvent).not.toHaveBeenCalled();
  });

  it("emits a reminder event carrying the row's kickoff wall-clock unshifted", async () => {
    const id = await seedGame({ matchId: null, matchNo: 100 });

    const result = await processorFn(makeJob({ refereeGameId: id }));

    expect(result).toEqual({ emitted: true });
    expect(mockPublishDomainEvent).toHaveBeenCalledOnce();
    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: EVENT_TYPES.REFEREE_SLOTS_REMINDER,
        source: "sync",
        entityType: "match",
        entityId: 12345,
        entityName: "Dragons vs Tigers",
        payload: expect.objectContaining({
          matchNo: 100,
          homeTeam: "Dragons",
          guestTeam: "Tigers",
          leagueName: "Bezirksliga",
          venueName: "Halle A",
          // A `date`/`time` column read as a JS Date would shift these under a
          // non-local zone; they must stay the stored wall-clock strings.
          kickoffDate: "2026-04-20",
          kickoffTime: "15:00:00",
          sr1Open: true,
          sr2Open: true,
          sr1Assigned: null,
          sr2Assigned: null,
          reminderLevel: 3,
          leagueId: null,
          venueId: null,
        }),
      }),
    );
  });

  it("uses matchId deep link when matchId is present", async () => {
    await ctx.client.query(
      `INSERT INTO teams (api_team_permanent_id, season_team_id, team_competition_id, name, club_id)
       VALUES (1, 1, 1, 'Dragons', 1), (2, 2, 2, 'Tigers', 2)`,
    );
    const m = await ctx.client.query<{ id: number }>(
      `INSERT INTO matches (api_match_id, match_no, match_day, kickoff_date, kickoff_time,
                            home_team_api_id, guest_team_api_id)
       VALUES (99, 1, 1, '2026-04-20', '15:00:00', 1, 2) RETURNING id`,
    );
    const matchId = m.rows[0]!.id;
    const id = await seedGame({ matchId });

    await processorFn(makeJob({ refereeGameId: id }));

    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        deepLinkPath: `/referee/matches?take=${matchId}`,
        payload: expect.objectContaining({
          matchId,
          deepLink: `/referee/matches?take=${matchId}`,
        }),
      }),
    );
  });

  it("uses apiMatchId deep link when matchId is null", async () => {
    const id = await seedGame({ matchId: null });

    await processorFn(makeJob({ refereeGameId: id }));

    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        deepLinkPath: "/referee/games?apiMatchId=12345",
        payload: expect.objectContaining({
          matchId: null,
          deepLink: "/referee/games?apiMatchId=12345",
        }),
      }),
    );
  });

  it("computes sr1Open/sr2Open from ourClub and status", async () => {
    const id = await seedGame({
      sr1OurClub: true,
      sr1Status: "assigned",
      sr1Name: "Max",
      sr2OurClub: false,
      sr2Status: "open",
      sr2Name: null,
    });

    await processorFn(makeJob({ refereeGameId: id }));

    // sr1 is assigned so sr1Open=false, sr2 is not our club so sr2Open=false
    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          sr1Open: false,
          sr2Open: false,
          sr1Assigned: "Max",
          sr2Assigned: null,
        }),
      }),
    );
  });

  it("sets sr1Open=true when sr1 is our club and not assigned", async () => {
    const id = await seedGame({
      sr1OurClub: true,
      sr1Status: "open",
      sr2OurClub: true,
      sr2Status: "assigned",
      sr2Name: "Erika",
    });

    await processorFn(makeJob({ refereeGameId: id }));

    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          sr1Open: true,
          sr2Open: false,
          sr1Assigned: null,
          sr2Assigned: "Erika",
        }),
      }),
    );
  });

  it("ignores a stale sr name when the slot is not assigned", async () => {
    // sr1Name survives a withdrawal in the feed; only sr1Status makes it count.
    const id = await seedGame({ sr1Status: "open", sr1Name: "Max" });

    await processorFn(makeJob({ refereeGameId: id }));

    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ sr1Assigned: null, sr1Open: true }),
      }),
    );
  });

  it("defaults leagueName to empty string when null", async () => {
    const id = await seedGame({ leagueName: null });

    await processorFn(makeJob({ refereeGameId: id }));

    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ leagueName: "" }),
      }),
    );
  });
});
