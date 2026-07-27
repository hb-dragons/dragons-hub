import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Queue } from "bullmq";

// The queue module re-exports the two schedule mutators for
// `services/admin/sync-admin.service.ts`; stub the service so importing the
// queues does not drag the database/Redis singletons into this test.
const serviceMocks = vi.hoisted(() => ({
  updateSyncSchedule: vi.fn(),
  updateRefereeSyncSchedule: vi.fn(),
}));
vi.mock("../services/sync-jobs.service", () => serviceMocks);

vi.mock("bullmq", () => ({
  Queue: class MockQueue {
    constructor(
      public name: string,
      public opts: Record<string, unknown>,
    ) {}
  },
}));

import {
  clearRepeatables,
  domainEventsQueue,
  digestQueue,
  syncQueue,
  refereeRemindersQueue,
  pushReceiptQueue,
  taskRemindersQueue,
  outboxPollQueue,
  updateSyncSchedule,
} from "./queues";

function fakeQueue(repeatables: { name: string; key: string }[]) {
  const removeRepeatableByKey = vi.fn().mockResolvedValue(undefined);
  const queue = {
    getRepeatableJobs: vi.fn().mockResolvedValue(repeatables),
    removeRepeatableByKey,
  };
  return { queue: queue as unknown as Queue, removeRepeatableByKey };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("queue declarations", () => {
  it("declares the seven queues on the shared {bull} prefix", () => {
    const queues = [
      domainEventsQueue,
      digestQueue,
      syncQueue,
      refereeRemindersQueue,
      pushReceiptQueue,
      taskRemindersQueue,
      outboxPollQueue,
    ];

    expect(queues.map((q) => q.name)).toEqual([
      "domain-events",
      "digest",
      "sync",
      "referee-reminders",
      "push-receipt",
      "task-reminders",
      "outbox-poll",
    ]);
    for (const queue of queues) {
      expect((queue as unknown as { opts: { prefix: string } }).opts.prefix).toBe("{bull}");
    }
  });

  it("keeps the sync queue on 3 attempts with exponential backoff", () => {
    const { defaultJobOptions } = (
      syncQueue as unknown as {
        opts: { defaultJobOptions: { attempts: number; backoff: { type: string; delay: number } } };
      }
    ).opts;

    expect(defaultJobOptions.attempts).toBe(3);
    expect(defaultJobOptions.backoff).toEqual({ type: "exponential", delay: 5000 });
  });
});

describe("clearRepeatables", () => {
  it("removes every repeatable when no job name is given", async () => {
    const { queue, removeRepeatableByKey } = fakeQueue([
      { name: "daily-sync", key: "key-1" },
      { name: "referee-games-sync-scheduled", key: "key-2" },
    ]);

    await clearRepeatables(queue);

    expect(removeRepeatableByKey).toHaveBeenCalledTimes(2);
    expect(removeRepeatableByKey).toHaveBeenCalledWith("key-1");
    expect(removeRepeatableByKey).toHaveBeenCalledWith("key-2");
  });

  it("removes only the named schedule when a job name is given", async () => {
    const { queue, removeRepeatableByKey } = fakeQueue([
      { name: "daily-sync", key: "key-1" },
      { name: "referee-games-sync-scheduled", key: "key-2" },
    ]);

    await clearRepeatables(queue, "daily-sync");

    expect(removeRepeatableByKey).toHaveBeenCalledTimes(1);
    expect(removeRepeatableByKey).toHaveBeenCalledWith("key-1");
  });

  it("is a no-op on an empty queue", async () => {
    const { queue, removeRepeatableByKey } = fakeQueue([]);

    await clearRepeatables(queue);

    expect(removeRepeatableByKey).not.toHaveBeenCalled();
  });
});

describe("schedule mutator re-exports", () => {
  it("forwards to the sync-jobs service implementation", async () => {
    await updateSyncSchedule(true, "0 5 * * *", "UTC");

    expect(serviceMocks.updateSyncSchedule).toHaveBeenCalledWith(true, "0 5 * * *", "UTC");
  });
});
