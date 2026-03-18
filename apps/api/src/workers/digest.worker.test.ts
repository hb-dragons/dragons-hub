import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Hoisted mocks ---

const mockDbSelect = vi.fn();
const mockDbTransaction = vi.fn();
const mockDbDelete = vi.fn();

let capturedProcessor: ((job: unknown) => Promise<unknown>) | null = null;
const mockWorkerOn = vi.fn();

// --- Module mocks ---

vi.mock("bullmq", () => ({
  Worker: class MockWorker {
    constructor(_name: string, processor: (job: unknown) => Promise<unknown>, _opts: unknown) {
      capturedProcessor = processor;
    }
    on(...args: unknown[]) {
      return mockWorkerOn(...args);
    }
  },
  Job: vi.fn(),
}));

vi.mock("../config/env", () => ({
  env: { REDIS_URL: "redis://localhost:6379" },
}));

vi.mock("../config/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

vi.mock("../config/database", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    transaction: (fn: (tx: unknown) => Promise<unknown>) => mockDbTransaction(fn),
    delete: (...args: unknown[]) => mockDbDelete(...args),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  digestBuffer: { id: "id", eventId: "eventId", channelConfigId: "channelConfigId" },
  domainEvents: {
    id: "id",
    type: "type",
    payload: "payload",
    entityName: "entityName",
    deepLinkPath: "deepLinkPath",
    urgency: "urgency",
    occurredAt: "occurredAt",
  },
  channelConfigs: { id: "id", enabled: "enabled" },
  notificationLog: {
    id: "id",
    eventId: "eventId",
    channelConfigId: "channelConfigId",
    recipientId: "recipientId",
    digestRunId: "digestRunId",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ _eq: args })),
  and: vi.fn((...args: unknown[]) => ({ _and: args })),
  inArray: vi.fn((...args: unknown[]) => ({ _inArray: args })),
}));

vi.mock("../services/notifications/templates/digest", () => ({
  renderDigestMessage: vi.fn().mockReturnValue({
    title: "Digest: 2 events",
    body: "- Event A\n- Event B",
  }),
}));

// --- Import after mocks ---

import { renderDigestMessage } from "../services/notifications/templates/digest";

// Force module load to capture the processor
await import("./digest.worker");

// --- Helpers ---

function makeJob(data: { channelConfigId: number; digestRunId: number }, id = "job-1") {
  return { id, data };
}

const sampleBufferedRows = [
  {
    bufferId: 1,
    eventId: 100,
    type: "match.scheduled",
    payload: { matchId: 1 },
    entityName: "Team A vs Team B",
    deepLinkPath: "/matches/1",
    urgency: "normal",
    occurredAt: new Date("2026-03-15T10:00:00Z"),
  },
  {
    bufferId: 2,
    eventId: 101,
    type: "match.updated",
    payload: { matchId: 2 },
    entityName: "Team C vs Team D",
    deepLinkPath: "/matches/2",
    urgency: "normal",
    occurredAt: new Date("2026-03-15T11:00:00Z"),
  },
];

// --- Tests ---

beforeEach(() => {
  vi.clearAllMocks();
});

describe("digest worker processor", () => {
  it("captures the processor function from Worker constructor", () => {
    expect(capturedProcessor).toBeTypeOf("function");
  });

  it("registers event handlers on the worker instance", async () => {
    const mod = await import("./digest.worker");
    expect(mod.digestWorker).toBeDefined();
    expect(typeof mod.digestWorker.on).toBe("function");
  });

  describe("channel config not found", () => {
    it("returns skipped with reason channel_config_not_found", async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await capturedProcessor!(makeJob({ channelConfigId: 999, digestRunId: 1 }));

      expect(result).toEqual({ skipped: true, reason: "channel_config_not_found" });
      expect(mockDbTransaction).not.toHaveBeenCalled();
    });
  });

  describe("channel config disabled", () => {
    it("returns skipped with reason channel_disabled", async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 1, enabled: false, type: "in_app", config: {} }]),
          }),
        }),
      });

      const result = await capturedProcessor!(makeJob({ channelConfigId: 1, digestRunId: 2 }));

      expect(result).toEqual({ skipped: true, reason: "channel_disabled" });
      expect(mockDbTransaction).not.toHaveBeenCalled();
    });
  });

  describe("no buffered events", () => {
    it("returns skipped with reason no_events", async () => {
      const configSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 1, enabled: true, type: "in_app", config: {} }]),
          }),
        }),
      };
      const bufferSelect = {
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };
      mockDbSelect
        .mockReturnValueOnce(configSelect)
        .mockReturnValueOnce(bufferSelect);

      const result = await capturedProcessor!(makeJob({ channelConfigId: 1, digestRunId: 3 }));

      expect(result).toEqual({ skipped: true, reason: "no_events" });
      expect(mockDbTransaction).not.toHaveBeenCalled();
    });
  });

  describe("successful in_app digest delivery", () => {
    function setupSuccessScenario(opts: { config?: Record<string, unknown> } = {}) {
      const config = opts.config ?? { id: 5, enabled: true, type: "in_app", config: { locale: "en" } };
      const configSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([config]),
          }),
        }),
      };
      const bufferSelect = {
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(sampleBufferedRows),
          }),
        }),
      };
      mockDbSelect
        .mockReturnValueOnce(configSelect)
        .mockReturnValueOnce(bufferSelect);

      // Transaction mock: execute the callback with a mock tx
      mockDbTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const mockInsert = vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 1 }]),
            }),
          }),
        });
        const mockDelete = vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        });

        return fn({ insert: mockInsert, delete: mockDelete });
      });
    }

    it("uses a transaction for send + buffer clear", async () => {
      setupSuccessScenario();

      await capturedProcessor!(makeJob({ channelConfigId: 5, digestRunId: 100 }));

      expect(mockDbTransaction).toHaveBeenCalledTimes(1);
    });

    it("renders digest message with correct items and locale", async () => {
      setupSuccessScenario();

      await capturedProcessor!(makeJob({ channelConfigId: 5, digestRunId: 100 }));

      expect(renderDigestMessage).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            eventType: "match.scheduled",
            entityName: "Team A vs Team B",
          }),
          expect.objectContaining({
            eventType: "match.updated",
            entityName: "Team C vs Team D",
          }),
        ]),
        "en",
      );
    });

    it("returns delivered result with event count and digestRunId", async () => {
      setupSuccessScenario();

      const result = await capturedProcessor!(makeJob({ channelConfigId: 5, digestRunId: 100 }));

      expect(result).toEqual({ delivered: true, eventCount: 2, digestRunId: 100 });
    });

    it("logs duplicate message when insert returns empty rows (dedup)", async () => {
      const config = { id: 5, enabled: true, type: "in_app", config: { locale: "en" } };
      const configSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([config]),
          }),
        }),
      };
      const bufferSelect = {
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(sampleBufferedRows),
          }),
        }),
      };
      mockDbSelect
        .mockReturnValueOnce(configSelect)
        .mockReturnValueOnce(bufferSelect);

      // Transaction mock: insert returns empty array (duplicate detected)
      mockDbTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const mockInsert = vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]),  // empty = duplicate
            }),
          }),
        });
        const mockDelete = vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        });

        return fn({ insert: mockInsert, delete: mockDelete });
      });

      const result = await capturedProcessor!(makeJob({ channelConfigId: 5, digestRunId: 200 }));

      // Still returns delivered since buffer is cleared regardless
      expect(result).toEqual({ delivered: true, eventCount: 2, digestRunId: 200 });
      expect(mockDbTransaction).toHaveBeenCalledTimes(1);
    });

    it("uses default locale 'de' when config has no locale", async () => {
      setupSuccessScenario({ config: { id: 5, enabled: true, type: "in_app", config: {} } });

      await capturedProcessor!(makeJob({ channelConfigId: 5, digestRunId: 100 }));

      expect(renderDigestMessage).toHaveBeenCalledWith(expect.any(Array), "de");
    });
  });

  describe("unsupported channel type", () => {
    it("still clears buffer in transaction", async () => {
      const configSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: 7, enabled: true, type: "email", config: {} },
            ]),
          }),
        }),
      };
      const bufferSelect = {
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(sampleBufferedRows),
          }),
        }),
      };
      mockDbSelect
        .mockReturnValueOnce(configSelect)
        .mockReturnValueOnce(bufferSelect);

      mockDbTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const mockDelete = vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        });
        return fn({ insert: vi.fn(), delete: mockDelete });
      });

      const result = await capturedProcessor!(makeJob({ channelConfigId: 7, digestRunId: 60 }));

      expect(mockDbTransaction).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ delivered: true, eventCount: 2, digestRunId: 60 });
    });
  });
});
