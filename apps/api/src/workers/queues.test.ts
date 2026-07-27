import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Queue } from "bullmq";

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
