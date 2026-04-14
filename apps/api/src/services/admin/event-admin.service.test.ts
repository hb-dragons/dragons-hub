import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mock setup ---

const mockSelect = vi.fn();
const mockInsert = vi.fn();

vi.mock("../../config/database", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  domainEvents: {
    id: "de.id",
    type: "de.type",
    entityType: "de.entityType",
    source: "de.source",
    occurredAt: "de.occurredAt",
    entityName: "de.entityName",
  },
  notificationLog: {
    id: "nl.id",
    eventId: "nl.eventId",
    watchRuleId: "nl.watchRuleId",
    channelConfigId: "nl.channelConfigId",
    recipientId: "nl.recipientId",
    title: "nl.title",
    body: "nl.body",
    locale: "nl.locale",
    status: "nl.status",
    errorMessage: "nl.errorMessage",
    retryCount: "nl.retryCount",
    createdAt: "nl.createdAt",
  },
  channelConfigs: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  desc: vi.fn((...args: unknown[]) => ({ desc: args })),
  gte: vi.fn((...args: unknown[]) => ({ gte: args })),
  lte: vi.fn((...args: unknown[]) => ({ lte: args })),
  ilike: vi.fn((...args: unknown[]) => ({ ilike: args })),
  count: vi.fn(() => "count()"),
}));

const mockBuildDomainEvent = vi.fn();
const mockInsertDomainEvent = vi.fn();
const mockEnqueueDomainEvent = vi.fn();

vi.mock("../events/event-publisher", () => ({
  buildDomainEvent: (...args: unknown[]) => mockBuildDomainEvent(...args),
  insertDomainEvent: (...args: unknown[]) => mockInsertDomainEvent(...args),
  enqueueDomainEvent: (...args: unknown[]) => mockEnqueueDomainEvent(...args),
}));

vi.mock("../notifications/templates/index", () => ({
  renderEventMessage: vi.fn(),
}));

vi.mock("../notifications/channels/in-app", () => ({
  InAppChannelAdapter: vi.fn(),
}));

vi.mock("../../config/logger", () => ({
  logger: { child: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}));

// --- Imports (after mocks) ---

import { listDomainEvents, triggerManualEvent, listFailedNotifications } from "./event-admin.service";
import { eq, gte, lte, ilike, and } from "drizzle-orm";

// --- Helpers ---

function makeDate(iso: string) {
  return { toISOString: () => iso };
}

function buildChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = ["from", "where", "orderBy", "limit", "offset"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: (v: unknown) => void) => {
    resolve(result);
    return chain;
  };
  return chain;
}

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-1",
    type: "match.created",
    source: "sync",
    urgency: "info",
    occurredAt: makeDate("2025-06-01T12:00:00.000Z"),
    actor: "system",
    syncRunId: 42,
    entityType: "match",
    entityId: 1,
    entityName: "Team A vs Team B",
    deepLinkPath: "/matches/1",
    enqueuedAt: makeDate("2025-06-01T12:00:01.000Z"),
    payload: { matchNo: 100 },
    createdAt: makeDate("2025-06-01T12:00:00.000Z"),
    ...overrides,
  };
}

// --- Tests ---

describe("listDomainEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty list with defaults (no filters)", async () => {
    const countChain = buildChain([{ count: 0 }]);
    const dataChain = buildChain([]);

    mockSelect.mockReturnValueOnce(countChain).mockReturnValueOnce(dataChain);

    const result = await listDomainEvents({});

    expect(result).toEqual({ events: [], total: 0 });
    expect(countChain.where).toHaveBeenCalledWith(undefined);
    expect(dataChain.where).toHaveBeenCalledWith(undefined);
    expect(dataChain.limit).toHaveBeenCalledWith(20);
    expect(dataChain.offset).toHaveBeenCalledWith(0);
  });

  it("applies type filter", async () => {
    const countChain = buildChain([{ count: 0 }]);
    const dataChain = buildChain([]);

    mockSelect.mockReturnValueOnce(countChain).mockReturnValueOnce(dataChain);

    await listDomainEvents({ type: "match.created" });

    expect(eq).toHaveBeenCalledWith("de.type", "match.created");
    expect(and).toHaveBeenCalled();
  });

  it("applies entityType filter", async () => {
    const countChain = buildChain([{ count: 0 }]);
    const dataChain = buildChain([]);

    mockSelect.mockReturnValueOnce(countChain).mockReturnValueOnce(dataChain);

    await listDomainEvents({ entityType: "match" });

    expect(eq).toHaveBeenCalledWith("de.entityType", "match");
    expect(and).toHaveBeenCalled();
  });

  it("applies source filter", async () => {
    const countChain = buildChain([{ count: 0 }]);
    const dataChain = buildChain([]);

    mockSelect.mockReturnValueOnce(countChain).mockReturnValueOnce(dataChain);

    await listDomainEvents({ source: "sync" });

    expect(eq).toHaveBeenCalledWith("de.source", "sync");
    expect(and).toHaveBeenCalled();
  });

  it("applies from/to date range filters", async () => {
    const countChain = buildChain([{ count: 0 }]);
    const dataChain = buildChain([]);

    mockSelect.mockReturnValueOnce(countChain).mockReturnValueOnce(dataChain);

    await listDomainEvents({
      from: "2025-01-01T00:00:00Z",
      to: "2025-12-31T23:59:59Z",
    });

    expect(gte).toHaveBeenCalledWith(
      "de.occurredAt",
      new Date("2025-01-01T00:00:00Z"),
    );
    expect(lte).toHaveBeenCalledWith(
      "de.occurredAt",
      new Date("2025-12-31T23:59:59Z"),
    );
    expect(and).toHaveBeenCalled();
  });

  it("applies search filter with LIKE escaping", async () => {
    const countChain = buildChain([{ count: 0 }]);
    const dataChain = buildChain([]);

    mockSelect.mockReturnValueOnce(countChain).mockReturnValueOnce(dataChain);

    await listDomainEvents({ search: "100%" });

    expect(ilike).toHaveBeenCalledWith("de.entityName", "%100\\%%");
  });

  it("escapes underscore in search pattern", async () => {
    const countChain = buildChain([{ count: 0 }]);
    const dataChain = buildChain([]);

    mockSelect.mockReturnValueOnce(countChain).mockReturnValueOnce(dataChain);

    await listDomainEvents({ search: "team_a" });

    expect(ilike).toHaveBeenCalledWith("de.entityName", "%team\\_a%");
  });

  it("escapes backslash in search pattern", async () => {
    const countChain = buildChain([{ count: 0 }]);
    const dataChain = buildChain([]);

    mockSelect.mockReturnValueOnce(countChain).mockReturnValueOnce(dataChain);

    await listDomainEvents({ search: "a\\b" });

    expect(ilike).toHaveBeenCalledWith("de.entityName", "%a\\\\b%");
  });

  it("handles pagination (page, limit, offset)", async () => {
    const countChain = buildChain([{ count: 50 }]);
    const dataChain = buildChain([]);

    mockSelect.mockReturnValueOnce(countChain).mockReturnValueOnce(dataChain);

    const result = await listDomainEvents({ page: 3, limit: 10 });

    expect(dataChain.limit).toHaveBeenCalledWith(10);
    expect(dataChain.offset).toHaveBeenCalledWith(20);
    expect(result.total).toBe(50);
  });

  it("maps row dates to ISO strings correctly", async () => {
    const row = makeRow();
    const countChain = buildChain([{ count: 1 }]);
    const dataChain = buildChain([row]);

    mockSelect.mockReturnValueOnce(countChain).mockReturnValueOnce(dataChain);

    const result = await listDomainEvents({});

    expect(result.events).toHaveLength(1);
    const event = result.events[0]!;
    expect(event.occurredAt).toBe("2025-06-01T12:00:00.000Z");
    expect(event.createdAt).toBe("2025-06-01T12:00:00.000Z");
    expect(event.enqueuedAt).toBe("2025-06-01T12:00:01.000Z");
    expect(event.id).toBe("evt-1");
    expect(event.type).toBe("match.created");
    expect(event.source).toBe("sync");
    expect(event.urgency).toBe("info");
    expect(event.actor).toBe("system");
    expect(event.syncRunId).toBe(42);
    expect(event.entityType).toBe("match");
    expect(event.entityId).toBe(1);
    expect(event.entityName).toBe("Team A vs Team B");
    expect(event.deepLinkPath).toBe("/matches/1");
    expect(event.payload).toEqual({ matchNo: 100 });
  });

  it("handles null enqueuedAt", async () => {
    const row = makeRow({ enqueuedAt: null });
    const countChain = buildChain([{ count: 1 }]);
    const dataChain = buildChain([row]);

    mockSelect.mockReturnValueOnce(countChain).mockReturnValueOnce(dataChain);

    const result = await listDomainEvents({});

    expect(result.events[0]!.enqueuedAt).toBeNull();
  });

  it("combines multiple filters", async () => {
    const countChain = buildChain([{ count: 0 }]);
    const dataChain = buildChain([]);

    mockSelect.mockReturnValueOnce(countChain).mockReturnValueOnce(dataChain);

    await listDomainEvents({
      type: "match.created",
      entityType: "match",
      source: "sync",
      from: "2025-01-01T00:00:00Z",
      to: "2025-12-31T23:59:59Z",
      search: "Dragons",
    });

    // All filter functions should have been called
    expect(eq).toHaveBeenCalledTimes(3); // type, entityType, source
    expect(gte).toHaveBeenCalledTimes(1);
    expect(lte).toHaveBeenCalledTimes(1);
    expect(ilike).toHaveBeenCalledTimes(1);

    // and() should receive all 6 conditions
    expect(and).toHaveBeenCalledWith(
      expect.objectContaining({ eq: expect.anything() }),
      expect.objectContaining({ eq: expect.anything() }),
      expect.objectContaining({ eq: expect.anything() }),
      expect.objectContaining({ gte: expect.anything() }),
      expect.objectContaining({ lte: expect.anything() }),
      expect.objectContaining({ ilike: expect.anything() }),
    );
  });
});

describe("triggerManualEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildDomainEvent.mockReturnValue({
      id: "evt-new",
      type: "match.created",
      urgency: "routine",
      entityType: "match",
      entityId: 1,
    });
    mockInsertDomainEvent.mockResolvedValue(undefined);
    mockEnqueueDomainEvent.mockResolvedValue(undefined);
  });

  it("builds, inserts, and enqueues a domain event", async () => {
    const result = await triggerManualEvent({
      type: "match.created",
      entityType: "match",
      entityId: 1,
      entityName: "Dragons vs Tigers",
      deepLinkPath: "/matches/1",
      payload: { matchNo: 100 },
      actor: "admin",
    });

    expect(mockBuildDomainEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "match.created",
        source: "manual",
        entityId: 1,
        actor: "admin",
      }),
    );
    expect(mockInsertDomainEvent).toHaveBeenCalledTimes(1);
    expect(mockEnqueueDomainEvent).toHaveBeenCalledTimes(1);
    expect(result.eventId).toBe("evt-new");
    expect(result.type).toBe("match.created");
  });

  it("applies urgency override before persisting", async () => {
    const builtEvent = {
      id: "evt-new",
      type: "match.created",
      urgency: "routine",
      entityType: "match",
      entityId: 1,
    };
    mockBuildDomainEvent.mockReturnValue(builtEvent);

    const result = await triggerManualEvent({
      type: "match.created",
      entityType: "match",
      entityId: 1,
      entityName: "Test",
      deepLinkPath: "/test",
      payload: {},
      urgencyOverride: "immediate",
      actor: "admin",
    });

    expect(builtEvent.urgency).toBe("immediate");
    expect(result.urgency).toBe("immediate");
  });

  it("does not override urgency when not specified", async () => {
    const builtEvent = {
      id: "evt-new",
      type: "match.created",
      urgency: "routine",
      entityType: "match",
      entityId: 1,
    };
    mockBuildDomainEvent.mockReturnValue(builtEvent);

    const result = await triggerManualEvent({
      type: "match.created",
      entityType: "match",
      entityId: 1,
      entityName: "Test",
      deepLinkPath: "/test",
      payload: {},
      actor: "admin",
    });

    expect(builtEvent.urgency).toBe("routine");
    expect(result.urgency).toBe("routine");
  });
});

describe("listFailedNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function buildNotificationChain(result: unknown) {
    const chain: Record<string, unknown> = {};
    const methods = ["from", "innerJoin", "where", "orderBy", "limit", "offset"];
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain.then = (resolve: (v: unknown) => void) => {
      resolve(result);
      return chain;
    };
    return chain;
  }

  it("returns empty list when no failed notifications", async () => {
    const countChain = buildNotificationChain([{ count: 0 }]);
    const dataChain = buildNotificationChain([]);

    mockSelect.mockReturnValueOnce(countChain).mockReturnValueOnce(dataChain);

    const result = await listFailedNotifications({});

    expect(result).toEqual({ notifications: [], total: 0 });
  });

  it("returns failed notifications with correct mapping", async () => {
    const row = {
      id: 1,
      eventId: "evt-1",
      watchRuleId: 10,
      channelConfigId: 5,
      recipientId: "user:1",
      title: "Match cancelled",
      body: "Your match was cancelled",
      locale: "de",
      status: "failed",
      errorMessage: "Connection timeout",
      retryCount: 3,
      createdAt: { toISOString: () => "2025-06-01T12:00:00.000Z" },
      eventType: "match.cancelled",
      entityName: "Dragons vs Tigers",
      deepLinkPath: "/matches/1",
    };

    const countChain = buildNotificationChain([{ count: 1 }]);
    const dataChain = buildNotificationChain([row]);

    mockSelect.mockReturnValueOnce(countChain).mockReturnValueOnce(dataChain);

    const result = await listFailedNotifications({ page: 1, limit: 10 });

    expect(result.total).toBe(1);
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0]).toEqual({
      id: 1,
      eventId: "evt-1",
      watchRuleId: 10,
      channelConfigId: 5,
      recipientId: "user:1",
      title: "Match cancelled",
      body: "Your match was cancelled",
      locale: "de",
      status: "failed",
      errorMessage: "Connection timeout",
      retryCount: 3,
      createdAt: "2025-06-01T12:00:00.000Z",
      eventType: "match.cancelled",
      entityName: "Dragons vs Tigers",
      deepLinkPath: "/matches/1",
    });
  });

  it("applies pagination correctly", async () => {
    const countChain = buildNotificationChain([{ count: 50 }]);
    const dataChain = buildNotificationChain([]);

    mockSelect.mockReturnValueOnce(countChain).mockReturnValueOnce(dataChain);

    const result = await listFailedNotifications({ page: 3, limit: 10 });

    expect(result.total).toBe(50);
    expect(dataChain.limit).toHaveBeenCalledWith(10);
    expect(dataChain.offset).toHaveBeenCalledWith(20);
  });
});
