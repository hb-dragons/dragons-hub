import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  selectResult: vi.fn(),
  insertReturning: vi.fn(),
  insertValues: vi.fn(),
  logDebug: vi.fn(),
  logInfo: vi.fn(),
}));

vi.mock("../../config/database", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: mocks.selectResult,
        }),
      }),
    }),
    insert: () => ({
      values: (...args: unknown[]) => {
        mocks.insertValues(...args);
        return {
          returning: mocks.insertReturning,
        };
      },
    }),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  channelConfigs: {
    id: "cc.id",
    name: "cc.name",
    type: "cc.type",
  },
  watchRules: {
    id: "wr.id",
    name: "wr.name",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({ eq: [_a, _b] })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
}));

vi.mock("../../config/logger", () => ({
  logger: {
    child: vi.fn(() => ({
      info: mocks.logInfo,
      debug: mocks.logDebug,
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

import { seedRefereeNotificationConfig } from "./seed-referee-watch-rule";

beforeEach(() => vi.clearAllMocks());

describe("seedRefereeNotificationConfig", () => {
  it("creates channel config and watch rule when neither exists", async () => {
    // No existing channel config
    mocks.selectResult.mockResolvedValueOnce([]);
    // Insert channel config returns id
    mocks.insertReturning.mockResolvedValueOnce([{ id: 42 }]);
    // No existing watch rule
    mocks.selectResult.mockResolvedValueOnce([]);

    await seedRefereeNotificationConfig();

    expect(mocks.insertValues).toHaveBeenCalledTimes(2);
    expect(mocks.insertReturning).toHaveBeenCalledTimes(1);
    expect(mocks.logInfo).toHaveBeenCalledTimes(2);
  });

  it("skips channel config creation when already exists, still creates watch rule", async () => {
    // Existing channel config found
    mocks.selectResult.mockResolvedValueOnce([{ id: 99 }]);
    // No existing watch rule
    mocks.selectResult.mockResolvedValueOnce([]);

    await seedRefereeNotificationConfig();

    // Only watch rule insert, no channel config insert
    expect(mocks.insertValues).toHaveBeenCalledTimes(1);
    expect(mocks.insertReturning).not.toHaveBeenCalled();
    expect(mocks.logDebug).toHaveBeenCalledWith(
      "Referee WhatsApp channel config already exists",
    );
  });

  it("skips both when both already exist", async () => {
    // Existing channel config found
    mocks.selectResult.mockResolvedValueOnce([{ id: 99 }]);
    // Existing watch rule found
    mocks.selectResult.mockResolvedValueOnce([{ id: 55 }]);

    await seedRefereeNotificationConfig();

    expect(mocks.insertValues).not.toHaveBeenCalled();
    expect(mocks.logDebug).toHaveBeenCalledWith(
      "Referee WhatsApp channel config already exists",
    );
    expect(mocks.logDebug).toHaveBeenCalledWith(
      "Referee slots watch rule already exists",
    );
  });

  it("uses existing channelConfigId for watch rule channels", async () => {
    // Existing channel config with id 77
    mocks.selectResult.mockResolvedValueOnce([{ id: 77 }]);
    // No existing watch rule
    mocks.selectResult.mockResolvedValueOnce([]);

    await seedRefereeNotificationConfig();

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        channels: [{ channel: "whatsapp_group", targetId: "77" }],
      }),
    );
  });
});
