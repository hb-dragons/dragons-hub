import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mock setup ---

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock("../../config/database", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  watchRules: {
    id: "wr.id",
    name: "wr.name",
    enabled: "wr.enabled",
    createdBy: "wr.createdBy",
    eventTypes: "wr.eventTypes",
    filters: "wr.filters",
    channels: "wr.channels",
    urgencyOverride: "wr.urgencyOverride",
    templateOverride: "wr.templateOverride",
    createdAt: "wr.createdAt",
    updatedAt: "wr.updatedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
  desc: vi.fn((...args: unknown[]) => ({ desc: args })),
  count: vi.fn(() => "count(*)"),
}));

// --- Imports (after mocks) ---

import {
  listWatchRules,
  getWatchRule,
  createWatchRule,
  updateWatchRule,
  deleteWatchRule,
} from "./watch-rule-admin.service";

// --- Helpers ---

function makeDate(iso: string) {
  return { toISOString: () => iso } as unknown as Date;
}

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Match alerts",
    enabled: true,
    createdBy: "user-1",
    eventTypes: ["match.scheduled"],
    filters: [{ field: "teamId", operator: "eq", value: "42" }],
    channels: [{ channel: "in_app", targetId: "1" }],
    urgencyOverride: null,
    templateOverride: null,
    createdAt: makeDate("2026-01-01T00:00:00.000Z"),
    updatedAt: makeDate("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

function buildChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = [
    "from",
    "where",
    "orderBy",
    "limit",
    "offset",
    "values",
    "set",
    "returning",
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (resolve: (v: unknown) => void) => {
    resolve(result);
    return chain;
  };
  return chain;
}

// --- Tests ---

describe("listWatchRules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns paginated results with correct total", async () => {
    const row = makeRow();
    const countChain = buildChain([{ count: 3 }]);
    const dataChain = buildChain([row]);

    mockSelect
      .mockReturnValueOnce(countChain)
      .mockReturnValueOnce(dataChain);

    const result = await listWatchRules({ page: 2, limit: 1 });

    expect(result.total).toBe(3);
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0]).toEqual({
      id: 1,
      name: "Match alerts",
      enabled: true,
      createdBy: "user-1",
      eventTypes: ["match.scheduled"],
      filters: [{ field: "teamId", operator: "eq", value: "42" }],
      channels: [{ channel: "in_app", targetId: "1" }],
      urgencyOverride: null,
      templateOverride: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });

    // Verify offset was called with (page-1)*limit = 1
    expect(dataChain.offset).toHaveBeenCalledWith(1);
    expect(dataChain.limit).toHaveBeenCalledWith(1);
  });

  it("uses default page=1, limit=20", async () => {
    const countChain = buildChain([{ count: 0 }]);
    const dataChain = buildChain([]);

    mockSelect
      .mockReturnValueOnce(countChain)
      .mockReturnValueOnce(dataChain);

    const result = await listWatchRules({});

    expect(result).toEqual({ rules: [], total: 0 });
    expect(dataChain.limit).toHaveBeenCalledWith(20);
    expect(dataChain.offset).toHaveBeenCalledWith(0);
  });
});

describe("getWatchRule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns item when found", async () => {
    const row = makeRow({ id: 5 });
    const chain = buildChain([row]);

    mockSelect.mockReturnValueOnce(chain);

    const result = await getWatchRule(5);

    expect(result).toEqual({
      id: 5,
      name: "Match alerts",
      enabled: true,
      createdBy: "user-1",
      eventTypes: ["match.scheduled"],
      filters: [{ field: "teamId", operator: "eq", value: "42" }],
      channels: [{ channel: "in_app", targetId: "1" }],
      urgencyOverride: null,
      templateOverride: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  });

  it("returns null when not found", async () => {
    const chain = buildChain([]);

    mockSelect.mockReturnValueOnce(chain);

    const result = await getWatchRule(999);

    expect(result).toBeNull();
  });
});

describe("createWatchRule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts with correct values including userId as createdBy", async () => {
    const row = makeRow({ id: 10, createdBy: "admin-42" });
    const chain = buildChain([row]);

    mockInsert.mockReturnValueOnce(chain);

    const result = await createWatchRule(
      {
        name: "Match alerts",
        eventTypes: ["match.scheduled"],
        filters: [{ field: "teamId", operator: "eq", value: "42" }],
        channels: [{ channel: "in_app", targetId: "1" }],
        enabled: true,
        urgencyOverride: null,
        templateOverride: null,
      },
      "admin-42",
    );

    expect(result.id).toBe(10);
    expect(result.createdBy).toBe("admin-42");
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(chain.values).toHaveBeenCalledWith({
      name: "Match alerts",
      enabled: true,
      createdBy: "admin-42",
      eventTypes: ["match.scheduled"],
      filters: [{ field: "teamId", operator: "eq", value: "42" }],
      channels: [{ channel: "in_app", targetId: "1" }],
      urgencyOverride: null,
      templateOverride: null,
    });
  });

  it("uses defaults for optional fields (enabled=true, filters=[], etc.)", async () => {
    const row = makeRow({
      id: 11,
      enabled: true,
      filters: [],
      urgencyOverride: null,
      templateOverride: null,
    });
    const chain = buildChain([row]);

    mockInsert.mockReturnValueOnce(chain);

    await createWatchRule(
      {
        name: "Minimal rule",
        eventTypes: ["match.cancelled"],
        channels: [{ channel: "in_app", targetId: "1" }],
      },
      "user-7",
    );

    expect(chain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        filters: [],
        urgencyOverride: null,
        templateOverride: null,
      }),
    );
  });
});

describe("updateWatchRule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("only sets provided fields plus updatedAt", async () => {
    const row = makeRow({ id: 3, name: "Renamed", enabled: false });
    const chain = buildChain([row]);

    mockUpdate.mockReturnValueOnce(chain);

    const result = await updateWatchRule(3, {
      name: "Renamed",
      enabled: false,
    });

    expect(result).not.toBeNull();
    expect(result!.name).toBe("Renamed");
    expect(result!.enabled).toBe(false);

    const setCall = (chain.set as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    expect(setCall.name).toBe("Renamed");
    expect(setCall.enabled).toBe(false);
    expect(setCall.updatedAt).toBeInstanceOf(Date);
    // Should NOT contain keys that were not provided
    expect(setCall).not.toHaveProperty("eventTypes");
    expect(setCall).not.toHaveProperty("filters");
    expect(setCall).not.toHaveProperty("channels");
    expect(setCall).not.toHaveProperty("urgencyOverride");
    expect(setCall).not.toHaveProperty("templateOverride");
  });

  it("returns null when not found", async () => {
    const chain = buildChain([]);

    mockUpdate.mockReturnValueOnce(chain);

    const result = await updateWatchRule(999, { name: "Nope" });

    expect(result).toBeNull();
  });

  it("sets eventTypes when provided", async () => {
    const row = makeRow({ id: 4, eventTypes: ["match.cancelled"] });
    const chain = buildChain([row]);
    mockUpdate.mockReturnValueOnce(chain);

    await updateWatchRule(4, { eventTypes: ["match.cancelled"] });

    const setCall = (chain.set as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    expect(setCall.eventTypes).toEqual(["match.cancelled"]);
  });

  it("sets filters when provided", async () => {
    const row = makeRow({ id: 5 });
    const chain = buildChain([row]);
    mockUpdate.mockReturnValueOnce(chain);

    const filters = [{ field: "teamId", operator: "eq", value: "99" }];
    await updateWatchRule(5, { filters });

    const setCall = (chain.set as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    expect(setCall.filters).toEqual(filters);
  });

  it("sets channels when provided", async () => {
    const row = makeRow({ id: 6 });
    const chain = buildChain([row]);
    mockUpdate.mockReturnValueOnce(chain);

    const channels = [{ channel: "push", targetId: "ch-1" }];
    await updateWatchRule(6, { channels });

    const setCall = (chain.set as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    expect(setCall.channels).toEqual(channels);
  });

  it("sets urgencyOverride when provided", async () => {
    const row = makeRow({ id: 7, urgencyOverride: "high" });
    const chain = buildChain([row]);
    mockUpdate.mockReturnValueOnce(chain);

    await updateWatchRule(7, { urgencyOverride: "high" });

    const setCall = (chain.set as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    expect(setCall.urgencyOverride).toBe("high");
  });

  it("sets templateOverride when provided", async () => {
    const row = makeRow({ id: 8, templateOverride: "my-tpl" });
    const chain = buildChain([row]);
    mockUpdate.mockReturnValueOnce(chain);

    await updateWatchRule(8, { templateOverride: "my-tpl" });

    const setCall = (chain.set as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    expect(setCall.templateOverride).toBe("my-tpl");
  });
});

describe("deleteWatchRule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when deleted", async () => {
    const chain = buildChain([{ id: 1 }]);

    mockDelete.mockReturnValueOnce(chain);

    const result = await deleteWatchRule(1);

    expect(result).toBe(true);
  });

  it("returns false when not found", async () => {
    const chain = buildChain([]);

    mockDelete.mockReturnValueOnce(chain);

    const result = await deleteWatchRule(999);

    expect(result).toBe(false);
  });
});
