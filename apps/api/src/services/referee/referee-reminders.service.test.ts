import { describe, it, expect } from "vitest";
import {
  computeReminderDelays,
  buildReminderJobId,
} from "./referee-reminders.service";

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
  it("builds deterministic job ID", () => {
    expect(buildReminderJobId(42, 7)).toBe("reminder:42:7");
    expect(buildReminderJobId(100, 1)).toBe("reminder:100:1");
  });
});
