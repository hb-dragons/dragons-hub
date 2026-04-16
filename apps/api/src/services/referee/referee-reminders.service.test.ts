import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  selectResult: vi.fn(),
  queueAdd: vi.fn(),
  queueGetJob: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
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
  },
}));

vi.mock("../../workers/queues", () => ({
  refereeRemindersQueue: {
    add: mocks.queueAdd,
    getJob: mocks.queueGetJob,
  },
}));

vi.mock("../../config/logger", () => ({
  logger: {
    child: vi.fn(() => ({
      info: mocks.logInfo,
      warn: mocks.logWarn,
      debug: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

vi.mock("@dragons/db/schema", () => ({
  appSettings: { key: "as.key", value: "as.value" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_a: unknown, _b: unknown) => ({ eq: [_a, _b] })),
}));

import {
  computeReminderDelays,
  buildReminderJobId,
  getReminderDays,
  scheduleReminderJobs,
  cancelReminderJobs,
} from "./referee-reminders.service";

beforeEach(() => vi.clearAllMocks());

describe("computeReminderDelays", () => {
  it("computes correct delays for future reminders", () => {
    // kickoff in 10 days
    const now = new Date("2026-03-01T04:00:00Z");
    const kickoffDate = "2026-03-11";
    const kickoffTime = "14:00";
    const reminderDays = [7, 3, 1];

    const delays = computeReminderDelays(kickoffDate, kickoffTime, reminderDays, now);

    expect(delays).toHaveLength(3);
    // 7 days before = March 4 14:00 → ~3.4 days from now
    expect(delays[0]!.days).toBe(7);
    expect(delays[0]!.delayMs).toBeGreaterThan(0);
    // 3 days before = March 8 14:00
    expect(delays[1]!.days).toBe(3);
    expect(delays[1]!.delayMs).toBeGreaterThan(delays[0]!.delayMs);
    // 1 day before = March 10 14:00
    expect(delays[2]!.days).toBe(1);
    expect(delays[2]!.delayMs).toBeGreaterThan(delays[1]!.delayMs);
  });

  it("skips reminders that are already in the past", () => {
    // kickoff in 2 days
    const now = new Date("2026-03-09T04:00:00Z");
    const kickoffDate = "2026-03-11";
    const kickoffTime = "14:00";
    const reminderDays = [7, 3, 1];

    const delays = computeReminderDelays(kickoffDate, kickoffTime, reminderDays, now);

    // Only 1-day reminder is in the future
    expect(delays).toHaveLength(1);
    expect(delays[0]!.days).toBe(1);
  });

  it("returns empty for past kickoff", () => {
    const now = new Date("2026-03-15T04:00:00Z");
    const kickoffDate = "2026-03-11";
    const kickoffTime = "14:00";
    const reminderDays = [7, 3, 1];

    const delays = computeReminderDelays(kickoffDate, kickoffTime, reminderDays, now);

    expect(delays).toHaveLength(0);
  });
});

describe("buildReminderJobId", () => {
  it("builds deterministic job ID from apiMatchId", () => {
    expect(buildReminderJobId(2675740, 7)).toBe("reminder:2675740:7");
    expect(buildReminderJobId(2836773, 1)).toBe("reminder:2836773:1");
  });
});

describe("getReminderDays", () => {
  it("reads reminder days from database", async () => {
    mocks.selectResult.mockResolvedValue([{ value: "[14, 5, 2]" }]);

    const result = await getReminderDays();

    expect(result).toEqual([14, 5, 2]);
  });

  it("returns sorted descending", async () => {
    mocks.selectResult.mockResolvedValue([{ value: "[1, 7, 3]" }]);

    const result = await getReminderDays();

    expect(result).toEqual([7, 3, 1]);
  });

  it("falls back to defaults when no row exists", async () => {
    mocks.selectResult.mockResolvedValue([]);

    const result = await getReminderDays();

    expect(result).toEqual([7, 3, 1]);
  });

  it("falls back to defaults when value is null", async () => {
    mocks.selectResult.mockResolvedValue([{ value: null }]);

    const result = await getReminderDays();

    expect(result).toEqual([7, 3, 1]);
  });

  it("falls back to defaults on parse error", async () => {
    mocks.selectResult.mockResolvedValue([{ value: "not-json" }]);

    const result = await getReminderDays();

    expect(result).toEqual([7, 3, 1]);
    expect(mocks.logWarn).toHaveBeenCalled();
  });

  it("falls back to defaults when array contains non-numbers", async () => {
    mocks.selectResult.mockResolvedValue([{ value: '["a", "b"]' }]);

    const result = await getReminderDays();

    expect(result).toEqual([7, 3, 1]);
  });

  it("falls back to defaults on db error", async () => {
    mocks.selectResult.mockRejectedValue(new Error("db down"));

    const result = await getReminderDays();

    expect(result).toEqual([7, 3, 1]);
    expect(mocks.logWarn).toHaveBeenCalled();
  });
});

describe("scheduleReminderJobs", () => {
  it("schedules jobs with correct delays and IDs", async () => {
    // Return default reminder days [7, 3, 1]
    mocks.selectResult.mockResolvedValue([]);
    mocks.queueAdd.mockResolvedValue(undefined);

    // Kickoff far in the future so all 3 reminders fire
    await scheduleReminderJobs(12345, 99, "2027-06-15", "14:00");

    expect(mocks.queueAdd).toHaveBeenCalledTimes(3);

    // Check each call has correct job data
    for (const call of mocks.queueAdd.mock.calls) {
      expect(call[0]).toBe("referee-reminder");
      expect(call[1]).toMatchObject({
        apiMatchId: 12345,
        refereeGameId: 99,
      });
      expect(call[2]).toHaveProperty("delay");
      expect(call[2]).toHaveProperty("jobId");
    }

    // Verify job IDs match expected pattern
    const jobIds = mocks.queueAdd.mock.calls.map(
      (c: unknown[]) => (c[2] as { jobId: string }).jobId,
    );
    expect(jobIds).toContain("reminder:12345:7");
    expect(jobIds).toContain("reminder:12345:3");
    expect(jobIds).toContain("reminder:12345:1");
  });

  it("skips reminders already in the past", async () => {
    mocks.selectResult.mockResolvedValue([]);
    mocks.queueAdd.mockResolvedValue(undefined);

    // Kickoff tomorrow — only 1-day reminder fires
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);
    const dateStr = tomorrow.toISOString().slice(0, 10);

    await scheduleReminderJobs(12345, 99, dateStr, "14:00");

    expect(mocks.queueAdd).toHaveBeenCalledTimes(1);
    expect(mocks.queueAdd).toHaveBeenCalledWith(
      "referee-reminder",
      expect.objectContaining({ reminderDays: 1 }),
      expect.objectContaining({ jobId: "reminder:12345:1" }),
    );
  });
});

describe("cancelReminderJobs", () => {
  it("removes existing jobs", async () => {
    mocks.selectResult.mockResolvedValue([]);
    const removeFn = vi.fn();
    mocks.queueGetJob.mockResolvedValue({ remove: removeFn });
    removeFn.mockResolvedValue(undefined);

    await cancelReminderJobs(12345);

    // 3 default reminder days
    expect(mocks.queueGetJob).toHaveBeenCalledTimes(3);
    expect(mocks.queueGetJob).toHaveBeenCalledWith("reminder:12345:7");
    expect(mocks.queueGetJob).toHaveBeenCalledWith("reminder:12345:3");
    expect(mocks.queueGetJob).toHaveBeenCalledWith("reminder:12345:1");
    expect(removeFn).toHaveBeenCalledTimes(3);
  });

  it("handles missing jobs gracefully", async () => {
    mocks.selectResult.mockResolvedValue([]);
    mocks.queueGetJob.mockResolvedValue(null);

    await cancelReminderJobs(12345);

    expect(mocks.queueGetJob).toHaveBeenCalledTimes(3);
    // No error thrown
  });
});
