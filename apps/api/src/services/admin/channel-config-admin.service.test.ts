import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mock setup (before module import) ---

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
  channelConfigs: {
    id: "id",
    name: "name",
    type: "type",
    enabled: "enabled",
    config: "config",
    digestMode: "digestMode",
    digestCron: "digestCron",
    digestTimezone: "digestTimezone",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
  desc: vi.fn((col: unknown) => ({ desc: col })),
  count: vi.fn(() => "count_fn"),
}));

// --- Imports (after mocks) ---

import {
  listChannelConfigs,
  getChannelConfig,
  createChannelConfig,
  updateChannelConfig,
  deleteChannelConfig,
} from "./channel-config-admin.service";

// --- Helpers ---

const NOW = new Date("2026-03-17T10:00:00.000Z");
const EARLIER = new Date("2026-03-16T08:00:00.000Z");

function makeDbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "WhatsApp Eltern",
    type: "whatsapp_group",
    enabled: true,
    config: { groupId: "abc", locale: "de" as const },
    digestMode: "per_sync",
    digestCron: null,
    digestTimezone: "Europe/Berlin",
    createdAt: EARLIER,
    updatedAt: NOW,
    ...overrides,
  };
}

// --- Chain helpers ---

function setupSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue(rows),
  };
  mockSelect.mockReturnValue(chain);
  return chain;
}

function setupInsertChain(rows: unknown[]) {
  const chain = {
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(rows),
    }),
  };
  mockInsert.mockReturnValue(chain);
  return chain;
}

function setupUpdateChain(rows: unknown[]) {
  const chain = {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
  mockUpdate.mockReturnValue(chain);
  return chain;
}

function setupDeleteChain(rows: unknown[]) {
  const chain = {
    where: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(rows),
    }),
  };
  mockDelete.mockReturnValue(chain);
  return chain;
}

// --- Reset ---

beforeEach(() => {
  vi.clearAllMocks();
});

// --- Tests ---

describe("listChannelConfigs", () => {
  it("returns configs and total with pagination", async () => {
    const row = makeDbRow();

    // First select call: count query
    const countChain = {
      from: vi.fn().mockResolvedValue([{ count: 1 }]),
    };
    // Second select call: data query
    const dataChain = {
      from: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockResolvedValue([row]),
          }),
        }),
      }),
    };

    mockSelect
      .mockReturnValueOnce(countChain)
      .mockReturnValueOnce(dataChain);

    const result = await listChannelConfigs({ page: 2, limit: 10 });

    expect(result.total).toBe(1);
    expect(result.configs).toHaveLength(1);
    expect(result.configs[0]!.id).toBe(1);
    expect(result.configs[0]!.name).toBe("WhatsApp Eltern");

    // Verify offset = (page - 1) * limit = 10
    const offsetFn = dataChain.from.mock.results[0]!.value
      .orderBy.mock.results[0]!.value
      .limit.mock.results[0]!.value.offset;
    expect(offsetFn).toHaveBeenCalledWith(10);
  });

  it("uses default page=1, limit=20", async () => {
    const countChain = {
      from: vi.fn().mockResolvedValue([{ count: 0 }]),
    };
    const limitFn = vi.fn().mockReturnValue({
      offset: vi.fn().mockResolvedValue([]),
    });
    const dataChain = {
      from: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: limitFn,
        }),
      }),
    };

    mockSelect
      .mockReturnValueOnce(countChain)
      .mockReturnValueOnce(dataChain);

    const result = await listChannelConfigs({});

    expect(result).toEqual({ configs: [], total: 0 });
    expect(limitFn).toHaveBeenCalledWith(20);

    const offsetFn = limitFn.mock.results[0]!.value.offset;
    expect(offsetFn).toHaveBeenCalledWith(0);
  });
});

describe("getChannelConfig", () => {
  it("returns item when found", async () => {
    const row = makeDbRow();
    const chain = setupSelectChain([row]);
    // Override: getChannelConfig uses .from().where(), not .from().orderBy()...
    chain.from.mockReturnValue({
      where: vi.fn().mockResolvedValue([row]),
    });

    const result = await getChannelConfig(1);

    expect(result).not.toBeNull();
    expect(result!.id).toBe(1);
    expect(result!.name).toBe("WhatsApp Eltern");
    expect(result!.type).toBe("whatsapp_group");
    expect(result!.createdAt).toBe(EARLIER.toISOString());
    expect(result!.updatedAt).toBe(NOW.toISOString());
  });

  it("returns null when not found", async () => {
    const chain = setupSelectChain([]);
    chain.from.mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    });

    const result = await getChannelConfig(999);

    expect(result).toBeNull();
  });
});

describe("createChannelConfig", () => {
  it("inserts with correct values and defaults", async () => {
    const row = makeDbRow();
    const insertChain = setupInsertChain([row]);

    const result = await createChannelConfig({
      name: "WhatsApp Eltern",
      type: "whatsapp_group",
      config: { groupId: "abc", locale: "de" },
    });

    expect(result.id).toBe(1);
    expect(result.name).toBe("WhatsApp Eltern");
    expect(result.type).toBe("whatsapp_group");

    // Verify defaults were applied in the values call
    const valuesCall = insertChain.values.mock.calls[0]![0] as Record<string, unknown>;
    expect(valuesCall.name).toBe("WhatsApp Eltern");
    expect(valuesCall.type).toBe("whatsapp_group");
    expect(valuesCall.enabled).toBe(true);
    expect(valuesCall.config).toEqual({ groupId: "abc", locale: "de" });
    expect(valuesCall.digestMode).toBe("per_sync");
    expect(valuesCall.digestCron).toBeNull();
    expect(valuesCall.digestTimezone).toBe("Europe/Berlin");
  });
});

describe("updateChannelConfig", () => {
  it("only sets provided fields plus updatedAt", async () => {
    const row = makeDbRow({ name: "Renamed" });
    const updateChain = setupUpdateChain([row]);

    const result = await updateChannelConfig(1, { name: "Renamed" });

    expect(result).not.toBeNull();
    expect(result!.name).toBe("Renamed");

    // Verify that set() was called with only name + updatedAt
    const setCall = updateChain.set.mock.calls[0]![0] as Record<string, unknown>;
    expect(setCall.name).toBe("Renamed");
    expect(setCall.updatedAt).toBeInstanceOf(Date);
    // type should NOT be in the updates (immutable)
    expect(setCall.type).toBeUndefined();
    // Other fields not provided should not be in set()
    expect(setCall.enabled).toBeUndefined();
    expect(setCall.config).toBeUndefined();
  });

  it("returns null when not found", async () => {
    setupUpdateChain([]);

    const result = await updateChannelConfig(999, { name: "Nope" });

    expect(result).toBeNull();
  });

  it("sets enabled when provided", async () => {
    const row = makeDbRow({ enabled: false });
    const updateChain = setupUpdateChain([row]);

    await updateChannelConfig(1, { enabled: false });

    const setCall = updateChain.set.mock.calls[0]![0] as Record<string, unknown>;
    expect(setCall.enabled).toBe(false);
  });

  it("sets config when provided", async () => {
    const row = makeDbRow({ config: { locale: "en" as const } });
    const updateChain = setupUpdateChain([row]);

    await updateChannelConfig(1, { config: { locale: "en" } });

    const setCall = updateChain.set.mock.calls[0]![0] as Record<string, unknown>;
    expect(setCall.config).toEqual({ locale: "en" });
  });

  it("sets digestMode when provided", async () => {
    const row = makeDbRow({ digestMode: "daily" });
    const updateChain = setupUpdateChain([row]);

    await updateChannelConfig(1, { digestMode: "daily" });

    const setCall = updateChain.set.mock.calls[0]![0] as Record<string, unknown>;
    expect(setCall.digestMode).toBe("daily");
  });

  it("sets digestCron when provided", async () => {
    const row = makeDbRow({ digestCron: "0 8 * * *" });
    const updateChain = setupUpdateChain([row]);

    await updateChannelConfig(1, { digestCron: "0 8 * * *" });

    const setCall = updateChain.set.mock.calls[0]![0] as Record<string, unknown>;
    expect(setCall.digestCron).toBe("0 8 * * *");
  });

  it("sets digestTimezone when provided", async () => {
    const row = makeDbRow({ digestTimezone: "America/New_York" });
    const updateChain = setupUpdateChain([row]);

    await updateChannelConfig(1, { digestTimezone: "America/New_York" });

    const setCall = updateChain.set.mock.calls[0]![0] as Record<string, unknown>;
    expect(setCall.digestTimezone).toBe("America/New_York");
  });
});

describe("deleteChannelConfig", () => {
  it("returns true when deleted", async () => {
    setupDeleteChain([{ id: 1 }]);

    const result = await deleteChannelConfig(1);

    expect(result).toBe(true);
  });

  it("returns false when not found", async () => {
    setupDeleteChain([]);

    const result = await deleteChannelConfig(999);

    expect(result).toBe(false);
  });
});

describe("toItem mapping", () => {
  it("converts dates to ISO strings and casts types correctly", async () => {
    const createdAt = new Date("2026-01-15T12:30:00.000Z");
    const updatedAt = new Date("2026-03-17T09:45:00.000Z");
    const row = makeDbRow({
      id: 42,
      name: "Email Digest",
      type: "email",
      enabled: false,
      config: { locale: "en" as const },
      digestMode: "daily",
      digestCron: "0 8 * * *",
      digestTimezone: "America/New_York",
      createdAt,
      updatedAt,
    });

    // Use getChannelConfig to exercise toItem indirectly
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([row]),
      }),
    });

    const result = await getChannelConfig(42);

    expect(result).toEqual({
      id: 42,
      name: "Email Digest",
      type: "email",
      enabled: false,
      config: { locale: "en" as const },
      digestMode: "daily",
      digestCron: "0 8 * * *",
      digestTimezone: "America/New_York",
      createdAt: "2026-01-15T12:30:00.000Z",
      updatedAt: "2026-03-17T09:45:00.000Z",
    });
  });
});
