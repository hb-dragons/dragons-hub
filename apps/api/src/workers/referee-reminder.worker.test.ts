import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Hoisted mock setup ---

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

const mockDbSelect = vi.fn();
vi.mock("../config/database", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("@dragons/db/schema", () => ({
  refereeGames: { id: "id" },
}));

const mockPublishDomainEvent = vi.fn();
vi.mock("../services/events/event-publisher", () => ({
  publishDomainEvent: (...args: unknown[]) => mockPublishDomainEvent(...args),
}));

vi.mock("@dragons/shared", () => ({
  EVENT_TYPES: { REFEREE_SLOTS_REMINDER: "referee.slots.reminder" },
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

// --- Test fixtures ---

const baseGame = {
  id: 1,
  apiMatchId: 12345,
  matchId: 42,
  matchNo: "M100",
  homeTeamName: "Dragons",
  guestTeamName: "Tigers",
  leagueName: "Bezirksliga",
  kickoffDate: "2026-04-20",
  kickoffTime: "15:00",
  venueName: "Halle A",
  isCancelled: false,
  isForfeited: false,
  sr1Status: "open",
  sr1Name: null,
  sr1OurClub: true,
  sr2Status: "open",
  sr2Name: null,
  sr2OurClub: true,
};

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

function mockDbReturns(rows: unknown[]) {
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

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
  it("skips when game is not found", async () => {
    mockDbReturns([]);

    const result = await processorFn(makeJob());

    expect(result).toEqual({ skipped: true, reason: "game_not_found" });
    expect(mockPublishDomainEvent).not.toHaveBeenCalled();
  });

  it("skips when both slots are filled", async () => {
    mockDbReturns([{
      ...baseGame,
      sr1Status: "assigned",
      sr1Name: "Max",
      sr2Status: "assigned",
      sr2Name: "Erika",
    }]);

    const result = await processorFn(makeJob());

    expect(result).toEqual({ skipped: true, reason: "not_needed" });
    expect(mockPublishDomainEvent).not.toHaveBeenCalled();
  });

  it("skips when match is cancelled", async () => {
    mockDbReturns([{ ...baseGame, isCancelled: true }]);

    const result = await processorFn(makeJob());

    expect(result).toEqual({ skipped: true, reason: "not_needed" });
    expect(mockPublishDomainEvent).not.toHaveBeenCalled();
  });

  it("emits reminder event when slots are open", async () => {
    mockDbReturns([{ ...baseGame }]);
    mockPublishDomainEvent.mockResolvedValue(undefined);

    const result = await processorFn(makeJob());

    expect(result).toEqual({ emitted: true });
    expect(mockPublishDomainEvent).toHaveBeenCalledOnce();
    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "referee.slots.reminder",
        source: "sync",
        entityType: "match",
        entityId: 12345,
        entityName: "Dragons vs Tigers",
        payload: expect.objectContaining({
          matchId: 42,
          matchNo: "M100",
          homeTeam: "Dragons",
          guestTeam: "Tigers",
          sr1Open: true,
          sr2Open: true,
          sr1Assigned: null,
          sr2Assigned: null,
          reminderLevel: 3,
        }),
      }),
    );
  });

  it("uses matchId deep link when matchId is present", async () => {
    mockDbReturns([{ ...baseGame, matchId: 42 }]);
    mockPublishDomainEvent.mockResolvedValue(undefined);

    await processorFn(makeJob());

    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        deepLinkPath: "/referee/matches?take=42",
        payload: expect.objectContaining({
          deepLink: "/referee/matches?take=42",
        }),
      }),
    );
  });

  it("uses apiMatchId deep link when matchId is null", async () => {
    mockDbReturns([{ ...baseGame, matchId: null }]);
    mockPublishDomainEvent.mockResolvedValue(undefined);

    await processorFn(makeJob());

    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        deepLinkPath: "/referee/games?apiMatchId=12345",
        payload: expect.objectContaining({
          deepLink: "/referee/games?apiMatchId=12345",
        }),
      }),
    );
  });

  it("computes sr1Open/sr2Open correctly based on ourClub and status", async () => {
    mockDbReturns([{
      ...baseGame,
      sr1OurClub: true,
      sr1Status: "assigned",
      sr1Name: "Max",
      sr2OurClub: false,
      sr2Status: "open",
      sr2Name: null,
    }]);
    mockPublishDomainEvent.mockResolvedValue(undefined);

    await processorFn(makeJob());

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
    mockDbReturns([{
      ...baseGame,
      sr1OurClub: true,
      sr1Status: "open",
      sr2OurClub: true,
      sr2Status: "assigned",
      sr2Name: "Erika",
    }]);
    mockPublishDomainEvent.mockResolvedValue(undefined);

    await processorFn(makeJob());

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

  it("defaults leagueName to empty string when null", async () => {
    mockDbReturns([{ ...baseGame, leagueName: null }]);
    mockPublishDomainEvent.mockResolvedValue(undefined);

    await processorFn(makeJob());

    expect(mockPublishDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          leagueName: "",
        }),
      }),
    );
  });
});
