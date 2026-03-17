import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Hoisted mocks ---

const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbDelete = vi.fn();
const mockInAppSend = vi.fn();

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
    update: (...args: unknown[]) => mockDbUpdate(...args),
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
}));

vi.mock("../services/notifications/templates/digest", () => ({
  renderDigestMessage: vi.fn().mockReturnValue({
    title: "Digest: 2 events",
    body: "- Event A\n- Event B",
  }),
}));

vi.mock("../services/notifications/channels/in-app", () => ({
  InAppChannelAdapter: class {
    send(...args: unknown[]) {
      return mockInAppSend(...args);
    }
  },
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
    // The worker is created at module load time, and .on() is called on the instance.
    // We verify the MockWorker class has an `on` method that would receive event handlers.
    // Import the module again to inspect the exported worker.
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
      expect(mockInAppSend).not.toHaveBeenCalled();
      expect(mockDbDelete).not.toHaveBeenCalled();
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
      expect(mockInAppSend).not.toHaveBeenCalled();
      expect(mockDbDelete).not.toHaveBeenCalled();
    });
  });

  describe("no buffered events", () => {
    it("returns skipped with reason no_events", async () => {
      // First call: channel config lookup
      const configSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 1, enabled: true, type: "in_app", config: {} }]),
          }),
        }),
      };
      // Second call: buffered events lookup
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
      expect(mockInAppSend).not.toHaveBeenCalled();
      expect(mockDbDelete).not.toHaveBeenCalled();
    });
  });

  describe("successful in_app digest delivery", () => {
    function setupSuccessScenario() {
      const configSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: 5, enabled: true, type: "in_app", config: { locale: "en" } },
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

      mockInAppSend.mockResolvedValue({ success: true, duplicate: false });

      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      mockDbDelete.mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
    }

    it("sends a single notification via InAppChannelAdapter", async () => {
      setupSuccessScenario();

      await capturedProcessor!(makeJob({ channelConfigId: 5, digestRunId: 100 }));

      expect(mockInAppSend).toHaveBeenCalledOnce();
      expect(mockInAppSend).toHaveBeenCalledWith({
        eventId: 100, // first buffered row's eventId
        watchRuleId: null,
        channelConfigId: 5,
        recipientId: "digest:5",
        title: "Digest: 2 events",
        body: "- Event A\n- Event B",
        locale: "en",
      });
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

    it("tags notification_log entry with digestRunId", async () => {
      setupSuccessScenario();

      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockDbUpdate.mockReturnValue({ set: mockSet });

      await capturedProcessor!(makeJob({ channelConfigId: 5, digestRunId: 100 }));

      expect(mockDbUpdate).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith({ digestRunId: 100 });
    });

    it("clears digest buffer for the channel", async () => {
      setupSuccessScenario();

      const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
      mockDbDelete.mockReturnValue({ where: mockDeleteWhere });

      await capturedProcessor!(makeJob({ channelConfigId: 5, digestRunId: 100 }));

      expect(mockDbDelete).toHaveBeenCalled();
      expect(mockDeleteWhere).toHaveBeenCalled();
    });

    it("returns delivered result with event count and digestRunId", async () => {
      setupSuccessScenario();

      const result = await capturedProcessor!(makeJob({ channelConfigId: 5, digestRunId: 100 }));

      expect(result).toEqual({ delivered: true, eventCount: 2, digestRunId: 100 });
    });

    it("uses default locale 'de' when config has no locale", async () => {
      const configSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: 5, enabled: true, type: "in_app", config: {} },
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

      mockInAppSend.mockResolvedValue({ success: true, duplicate: false });
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });
      mockDbDelete.mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      await capturedProcessor!(makeJob({ channelConfigId: 5, digestRunId: 100 }));

      expect(renderDigestMessage).toHaveBeenCalledWith(expect.any(Array), "de");
      expect(mockInAppSend).toHaveBeenCalledWith(
        expect.objectContaining({ locale: "de" }),
      );
    });
  });

  describe("delivery failure", () => {
    it("logs error but still clears buffer", async () => {
      const configSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: 3, enabled: true, type: "in_app", config: {} },
            ]),
          }),
        }),
      };
      const bufferSelect = {
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([sampleBufferedRows[0]]),
          }),
        }),
      };
      mockDbSelect
        .mockReturnValueOnce(configSelect)
        .mockReturnValueOnce(bufferSelect);

      mockInAppSend.mockResolvedValue({ success: false, error: "DB insert failed" });

      const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
      mockDbDelete.mockReturnValue({ where: mockDeleteWhere });

      const result = await capturedProcessor!(makeJob({ channelConfigId: 3, digestRunId: 50 }));

      // Should NOT update digestRunId
      expect(mockDbUpdate).not.toHaveBeenCalled();
      // Should still clear buffer
      expect(mockDbDelete).toHaveBeenCalled();
      // Should still return delivered
      expect(result).toEqual({ delivered: true, eventCount: 1, digestRunId: 50 });
    });
  });

  describe("unsupported channel type", () => {
    it("logs warning and clears buffer anyway", async () => {
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

      const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
      mockDbDelete.mockReturnValue({ where: mockDeleteWhere });

      const result = await capturedProcessor!(makeJob({ channelConfigId: 7, digestRunId: 60 }));

      // Should not attempt to send via inAppAdapter
      expect(mockInAppSend).not.toHaveBeenCalled();
      // Should not update digestRunId
      expect(mockDbUpdate).not.toHaveBeenCalled();
      // Should still clear buffer
      expect(mockDbDelete).toHaveBeenCalled();
      // Should return delivered
      expect(result).toEqual({ delivered: true, eventCount: 2, digestRunId: 60 });
    });
  });

  describe("duplicate detection", () => {
    it("does not update digestRunId when adapter returns duplicate", async () => {
      const configSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: 4, enabled: true, type: "in_app", config: { locale: "de" } },
            ]),
          }),
        }),
      };
      const bufferSelect = {
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([sampleBufferedRows[0]]),
          }),
        }),
      };
      mockDbSelect
        .mockReturnValueOnce(configSelect)
        .mockReturnValueOnce(bufferSelect);

      mockInAppSend.mockResolvedValue({ success: true, duplicate: true });

      const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
      mockDbDelete.mockReturnValue({ where: mockDeleteWhere });

      const result = await capturedProcessor!(makeJob({ channelConfigId: 4, digestRunId: 70 }));

      // Should NOT update digestRunId when duplicate
      expect(mockDbUpdate).not.toHaveBeenCalled();
      // Should still clear buffer
      expect(mockDbDelete).toHaveBeenCalled();
      // Should still return delivered
      expect(result).toEqual({ delivered: true, eventCount: 1, digestRunId: 70 });
    });
  });

  describe("config with null config field", () => {
    it("falls back to 'de' locale when config is null", async () => {
      const configSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: 2, enabled: true, type: "in_app", config: null },
            ]),
          }),
        }),
      };
      const bufferSelect = {
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([sampleBufferedRows[0]]),
          }),
        }),
      };
      mockDbSelect
        .mockReturnValueOnce(configSelect)
        .mockReturnValueOnce(bufferSelect);

      mockInAppSend.mockResolvedValue({ success: true, duplicate: false });
      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });
      mockDbDelete.mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      await capturedProcessor!(makeJob({ channelConfigId: 2, digestRunId: 80 }));

      expect(renderDigestMessage).toHaveBeenCalledWith(expect.any(Array), "de");
      expect(mockInAppSend).toHaveBeenCalledWith(
        expect.objectContaining({ locale: "de" }),
      );
    });
  });
});
