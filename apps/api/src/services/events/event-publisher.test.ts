import { describe, expect, it, vi, beforeEach } from "vitest";
import { EVENT_TYPES } from "@dragons/shared";

// --- Mock setup ---

vi.mock("../../config/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockInsert = vi.fn();
const mockUpdate = vi.fn();
vi.mock("../../config/database", () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  domainEvents: {
    id: "id",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
}));

const mockQueueAdd = vi.fn().mockResolvedValue({ id: "queue-job-1" });
vi.mock("../../workers/queues", () => ({
  domainEventsQueue: {
    add: (...args: unknown[]) => mockQueueAdd(...args),
  },
}));

// Mock ulid to return predictable values
let ulidCounter = 0;
vi.mock("ulid", () => ({
  ulid: () => `01TEST${String(ulidCounter++).padStart(20, "0")}`,
}));

import {
  buildDomainEvent,
  insertDomainEvent,
  enqueueDomainEvent,
  publishDomainEvent,
} from "./event-publisher";

beforeEach(() => {
  vi.clearAllMocks();
  ulidCounter = 0;
  mockInsert.mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([]),
    }),
  });
  mockUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });
});

describe("buildDomainEvent", () => {
  it("produces an event with ULID id", () => {
    const event = buildDomainEvent({
      type: EVENT_TYPES.MATCH_CREATED,
      source: "sync",
      entityType: "match",
      entityId: 1,
      entityName: "Team A vs Team B",
      deepLinkPath: "/matches/1",
      payload: { matchNo: 100 },
    });

    expect(event.id).toMatch(/^01TEST/);
  });

  it("classifies urgency based on event type", () => {
    const routine = buildDomainEvent({
      type: EVENT_TYPES.MATCH_CREATED,
      source: "sync",
      entityType: "match",
      entityId: 1,
      entityName: "Game",
      deepLinkPath: "/matches/1",
      payload: {},
    });
    expect(routine.urgency).toBe("routine");

    const immediate = buildDomainEvent({
      type: EVENT_TYPES.MATCH_CANCELLED,
      source: "sync",
      entityType: "match",
      entityId: 1,
      entityName: "Game",
      deepLinkPath: "/matches/1",
      payload: {},
    });
    expect(immediate.urgency).toBe("immediate");
  });

  it("uses provided occurredAt or defaults to now", () => {
    const customDate = new Date("2026-01-01T00:00:00Z");
    const withDate = buildDomainEvent({
      type: EVENT_TYPES.MATCH_CREATED,
      source: "sync",
      occurredAt: customDate,
      entityType: "match",
      entityId: 1,
      entityName: "Game",
      deepLinkPath: "/matches/1",
      payload: {},
    });
    expect(withDate.occurredAt).toBe(customDate);

    const withoutDate = buildDomainEvent({
      type: EVENT_TYPES.MATCH_CREATED,
      source: "sync",
      entityType: "match",
      entityId: 1,
      entityName: "Game",
      deepLinkPath: "/matches/1",
      payload: {},
    });
    expect(withoutDate.occurredAt).toBeInstanceOf(Date);
  });

  it("defaults actor and syncRunId to null", () => {
    const event = buildDomainEvent({
      type: EVENT_TYPES.MATCH_CREATED,
      source: "sync",
      entityType: "match",
      entityId: 1,
      entityName: "Game",
      deepLinkPath: "/matches/1",
      payload: {},
    });
    expect(event.actor).toBeNull();
    expect(event.syncRunId).toBeNull();
  });

  it("carries through provided actor and syncRunId", () => {
    const event = buildDomainEvent({
      type: EVENT_TYPES.MATCH_CREATED,
      source: "sync",
      actor: "user-123",
      syncRunId: 42,
      entityType: "match",
      entityId: 1,
      entityName: "Game",
      deepLinkPath: "/matches/1",
      payload: { matchNo: 100 },
    });
    expect(event.actor).toBe("user-123");
    expect(event.syncRunId).toBe(42);
  });

  it("preserves all fields in payload", () => {
    const payload = { matchNo: 100, homeTeam: "Dragons", guestTeam: "Bears" };
    const event = buildDomainEvent({
      type: EVENT_TYPES.MATCH_CREATED,
      source: "sync",
      entityType: "match",
      entityId: 1,
      entityName: "Game",
      deepLinkPath: "/matches/1",
      payload,
    });
    expect(event.payload).toEqual(payload);
  });
});

describe("insertDomainEvent", () => {
  it("inserts event into domainEvents table", async () => {
    const event = buildDomainEvent({
      type: EVENT_TYPES.MATCH_CREATED,
      source: "sync",
      entityType: "match",
      entityId: 1,
      entityName: "Game",
      deepLinkPath: "/matches/1",
      payload: {},
    });

    await insertDomainEvent(event);

    expect(mockInsert).toHaveBeenCalled();
  });

  it("uses transaction client when provided", async () => {
    const mockTxInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    });
    const tx = { insert: mockTxInsert } as unknown as Parameters<
      Parameters<typeof import("../../config/database").db.transaction>[0]
    >[0];

    const event = buildDomainEvent({
      type: EVENT_TYPES.MATCH_CREATED,
      source: "sync",
      entityType: "match",
      entityId: 1,
      entityName: "Game",
      deepLinkPath: "/matches/1",
      payload: {},
    });

    await insertDomainEvent(event, tx);

    expect(mockTxInsert).toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("enqueueDomainEvent", () => {
  it("enqueues event to BullMQ and marks enqueuedAt", async () => {
    const event = buildDomainEvent({
      type: EVENT_TYPES.MATCH_CANCELLED,
      source: "sync",
      entityType: "match",
      entityId: 1,
      entityName: "Game",
      deepLinkPath: "/matches/1",
      payload: {},
    });

    await enqueueDomainEvent(event);

    expect(mockQueueAdd).toHaveBeenCalledWith(
      EVENT_TYPES.MATCH_CANCELLED,
      expect.objectContaining({
        eventId: event.id,
        type: EVENT_TYPES.MATCH_CANCELLED,
        urgency: "immediate",
      }),
    );
    expect(mockUpdate).toHaveBeenCalled();
  });

  it("logs warning but does not throw on enqueue failure", async () => {
    mockQueueAdd.mockRejectedValueOnce(new Error("Redis down"));

    const event = buildDomainEvent({
      type: EVENT_TYPES.MATCH_CREATED,
      source: "sync",
      entityType: "match",
      entityId: 1,
      entityName: "Game",
      deepLinkPath: "/matches/1",
      payload: {},
    });

    // Should not throw
    await expect(enqueueDomainEvent(event)).resolves.toBeUndefined();

    const { logger } = await import("../../config/logger");
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe("publishDomainEvent", () => {
  it("inserts and enqueues in one call", async () => {
    const event = await publishDomainEvent({
      type: EVENT_TYPES.MATCH_CREATED,
      source: "sync",
      entityType: "match",
      entityId: 1,
      entityName: "Game",
      deepLinkPath: "/matches/1",
      payload: {},
    });

    expect(event.id).toBeDefined();
    expect(event.type).toBe(EVENT_TYPES.MATCH_CREATED);
    expect(mockInsert).toHaveBeenCalled();
    // enqueue is fire-and-forget, but the mock should be called
  });
});
