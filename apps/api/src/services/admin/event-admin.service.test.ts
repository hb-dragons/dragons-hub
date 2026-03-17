import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mock setup ---

const mockSelect = vi.fn();

vi.mock("../../config/database", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  domainEvents: {
    type: "de.type",
    entityType: "de.entityType",
    source: "de.source",
    occurredAt: "de.occurredAt",
    entityName: "de.entityName",
  },
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

// --- Imports (after mocks) ---

import { listDomainEvents } from "./event-admin.service";
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
