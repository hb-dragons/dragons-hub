import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";

// Use vi.hoisted so the array is available inside the vi.mock factory
const { capturedProcessors } = vi.hoisted(() => ({
  capturedProcessors: [] as Array<(job: Job<unknown>) => Promise<unknown>>,
}));

vi.mock("bullmq", () => ({
  Worker: class MockWorker {
    constructor(_name: string, processor: (job: Job<unknown>) => Promise<unknown>) {
      capturedProcessors.push(processor);
    }
    on() {
      return this;
    }
  },
}));

const mockPollOutbox = vi.fn();
vi.mock("../services/events/outbox-poller", () => ({
  pollOutbox: (...args: unknown[]) => mockPollOutbox(...args),
}));

vi.mock("../config/env", () => ({
  env: { REDIS_URL: "redis://localhost:6379" },
}));

vi.mock("../config/logger", () => ({
  logger: {
    child: vi.fn().mockReturnValue({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
    error: vi.fn(),
  },
}));

vi.mock("../config/log-context", () => ({
  runWithTrace: vi.fn((_carrier: unknown, fn: () => unknown) => fn()),
}));

// Import after mocks so the Worker constructor is called with our mock
import "./outbox-poll.worker";
import { runWithTrace } from "../config/log-context";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(runWithTrace).mockImplementation((_carrier, fn) => fn());
});

describe("outboxPollWorker processor", () => {
  it("calls pollOutbox and returns { enqueued } when events are found", async () => {
    mockPollOutbox.mockResolvedValueOnce(5);

    const processor = capturedProcessors[0]!;
    const result = await processor({} as Job<unknown>);

    expect(mockPollOutbox).toHaveBeenCalledOnce();
    expect(result).toEqual({ enqueued: 5 });
  });

  it("calls pollOutbox and returns { enqueued: 0 } when no events are found", async () => {
    mockPollOutbox.mockResolvedValueOnce(0);

    const processor = capturedProcessors[0]!;
    const result = await processor({} as Job<unknown>);

    expect(mockPollOutbox).toHaveBeenCalledOnce();
    expect(result).toEqual({ enqueued: 0 });
  });

  it("runs inside runWithTrace with undefined carrier", async () => {
    mockPollOutbox.mockResolvedValueOnce(2);

    const processor = capturedProcessors[0]!;
    await processor({} as Job<unknown>);

    expect(runWithTrace).toHaveBeenCalledWith(undefined, expect.any(Function));
  });

  it("propagates errors from pollOutbox", async () => {
    mockPollOutbox.mockRejectedValueOnce(new Error("Redis down"));

    const processor = capturedProcessors[0]!;
    await expect(processor({} as Job<unknown>)).rejects.toThrow("Redis down");
  });
});
