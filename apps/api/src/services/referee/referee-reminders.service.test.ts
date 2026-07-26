import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from "vitest";

// drizzle-orm and @dragons/db/schema are deliberately NOT mocked (issue #110).
// `getReminderDays` is a scoped read — the row for one settings key, not just
// "the first row" — and stubbing `eq` to an identity function made that scoping
// unobservable. It reads from a real (in-process PGlite) Postgres here.
// The queue and the logger stay mocked: they are external side effects.

const dbHolder = vi.hoisted(() => ({ ref: null as unknown }));

const mocks = vi.hoisted(() => ({
  queueAdd: vi.fn(),
  queueGetJob: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock("../../config/database", () => ({
  getDb: () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => (dbHolder.ref as Record<string | symbol, unknown>)[prop],
      },
    ),
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

import {
  computeReminderDelays,
  buildReminderJobId,
  getReminderDays,
  scheduleReminderJobs,
  cancelReminderJobs,
} from "./referee-reminders.service";
import { appSettings } from "@dragons/db/schema";
import {
  setupTestDb,
  resetTestDb,
  closeTestDb,
  type TestDbContext,
} from "../../test/setup-test-db";

let ctx: TestDbContext;

beforeAll(async () => {
  ctx = await setupTestDb();
  dbHolder.ref = ctx.db;
});

afterAll(async () => {
  await closeTestDb(ctx);
});

async function seedSetting(key: string, value: string): Promise<void> {
  await ctx.db.insert(appSettings).values({ key, value });
}

beforeEach(async () => {
  await resetTestDb(ctx);
  dbHolder.ref = ctx.db;
  vi.clearAllMocks();
});

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

describe("computeReminderDelays - timezone correctness (issue #96)", () => {
  // `vi.stubEnv`, not `process.env.TZ = original`. TZ is unset on developer
  // machines that get their zone from /etc/localtime, so restoring by
  // assignment writes the literal string "undefined", which Node treats as an
  // invalid zone and falls back to UTC — silently leaving every later test in
  // this worker in a different timezone than it started in. `unstubAllEnvs`
  // deletes a key that was originally absent, which assignment cannot do.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves the exact UTC instant for a CEST (summer) Berlin kickoff under a non-Berlin process TZ", () => {
    vi.stubEnv("TZ", "UTC");
    // 19:30 Berlin time in July is CEST (UTC+2) -> 17:30Z
    const now = new Date("2026-07-01T00:00:00Z");
    const delays = computeReminderDelays("2026-07-15", "19:30", [0], now);

    expect(delays).toHaveLength(1);
    const expectedKickoffUtc = new Date("2026-07-15T17:30:00Z");
    expect(delays[0]!.delayMs).toBe(expectedKickoffUtc.getTime() - now.getTime());
  });

  it("resolves the exact UTC instant for a CET (winter) Berlin kickoff under a non-Berlin process TZ", () => {
    vi.stubEnv("TZ", "UTC");
    // 19:30 Berlin time in January is CET (UTC+1) -> 18:30Z
    const now = new Date("2026-01-01T00:00:00Z");
    const delays = computeReminderDelays("2026-01-15", "19:30", [0], now);

    expect(delays).toHaveLength(1);
    const expectedKickoffUtc = new Date("2026-01-15T18:30:00Z");
    expect(delays[0]!.delayMs).toBe(expectedKickoffUtc.getTime() - now.getTime());
  });

  it("resolves the same correct UTC instant under America/New_York process TZ", () => {
    vi.stubEnv("TZ", "America/New_York");
    const now = new Date("2026-07-01T00:00:00Z");
    const delays = computeReminderDelays("2026-07-15", "19:30", [0], now);

    expect(delays).toHaveLength(1);
    const expectedKickoffUtc = new Date("2026-07-15T17:30:00Z");
    expect(delays[0]!.delayMs).toBe(expectedKickoffUtc.getTime() - now.getTime());
  });

  it("still excludes an already-passed kickoff under a non-Berlin process TZ", () => {
    vi.stubEnv("TZ", "UTC");
    // "now" is after the CEST kickoff instant (17:30Z), so the 0-day reminder must be excluded
    const now = new Date("2026-07-15T18:00:00Z");
    const delays = computeReminderDelays("2026-07-15", "19:30", [0], now);

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
  it("reads reminder days from the referee_reminder_days setting", async () => {
    await seedSetting("referee_reminder_days", "[14, 5, 2]");

    expect(await getReminderDays()).toEqual([14, 5, 2]);
  });

  it("returns them sorted descending", async () => {
    await seedSetting("referee_reminder_days", "[1, 7, 3]");

    expect(await getReminderDays()).toEqual([7, 3, 1]);
  });

  it("reads its own key, not whichever settings row comes first", async () => {
    await seedSetting("club_id", "[99]");
    await seedSetting("referee_reminder_days", "[14, 5, 2]");
    await seedSetting("tracked_leagues", "[42]");

    expect(await getReminderDays()).toEqual([14, 5, 2]);
  });

  it("falls back to defaults when the setting is absent", async () => {
    await seedSetting("some_other_setting", "[14, 5, 2]");

    expect(await getReminderDays()).toEqual([7, 3, 1]);
  });

  it("falls back to defaults when the stored value is not JSON", async () => {
    await seedSetting("referee_reminder_days", "not-json");

    expect(await getReminderDays()).toEqual([7, 3, 1]);
    expect(mocks.logWarn).toHaveBeenCalled();
  });

  it("falls back to defaults when the array contains non-numbers", async () => {
    await seedSetting("referee_reminder_days", '["a", "b"]');

    expect(await getReminderDays()).toEqual([7, 3, 1]);
  });

  it("falls back to defaults when the array contains non-positive numbers", async () => {
    await seedSetting("referee_reminder_days", "[7, 0]");

    expect(await getReminderDays()).toEqual([7, 3, 1]);
  });

  it("falls back to defaults when the JSON is not an array", async () => {
    await seedSetting("referee_reminder_days", '{"days": 7}');

    expect(await getReminderDays()).toEqual([7, 3, 1]);
  });

  it("falls back to defaults when the database read throws", async () => {
    dbHolder.ref = {
      select: () => {
        throw new Error("db down");
      },
    };

    expect(await getReminderDays()).toEqual([7, 3, 1]);
    expect(mocks.logWarn).toHaveBeenCalled();
  });
});

describe("scheduleReminderJobs", () => {
  it("schedules jobs with correct delays and IDs", async () => {
    // No app_settings row seeded → default reminder days [7, 3, 1]
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

  it("uses the reminder days configured in app_settings", async () => {
    await seedSetting("referee_reminder_days", "[10, 2]");
    mocks.queueAdd.mockResolvedValue(undefined);

    await scheduleReminderJobs(12345, 99, "2027-06-15", "14:00");

    const jobIds = mocks.queueAdd.mock.calls.map(
      (c: unknown[]) => (c[2] as { jobId: string }).jobId,
    );
    expect(jobIds).toEqual(["reminder:12345:10", "reminder:12345:2"]);
  });
});

describe("cancelReminderJobs", () => {
  it("removes existing jobs", async () => {
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
    mocks.queueGetJob.mockResolvedValue(null);

    await cancelReminderJobs(12345);

    expect(mocks.queueGetJob).toHaveBeenCalledTimes(3);
    // No error thrown
  });

  it("cancels the configured reminder days, not the defaults", async () => {
    await seedSetting("referee_reminder_days", "[10, 2]");
    mocks.queueGetJob.mockResolvedValue(null);

    await cancelReminderJobs(12345);

    expect(mocks.queueGetJob.mock.calls.flat()).toEqual([
      "reminder:12345:10",
      "reminder:12345:2",
    ]);
  });
});
