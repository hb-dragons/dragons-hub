import { describe, expect, it, vi } from "vitest";
import { createSseResponse, sseEvent } from "./sse-helper";

// Drives a ReadableStream to a terminal state: resolves when the stream
// completes (done), rejects with the stream's error if it errors.
async function drainUntilDone(stream: ReadableStream<Uint8Array>): Promise<void> {
  const reader = stream.getReader();
  for (;;) {
    const { done } = await reader.read();
    if (done) return;
  }
}

// Reads and decodes the next chunk of text from a stream.
async function readText(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const { value } = await reader.read();
  return new TextDecoder().decode(value);
}

describe("createSseResponse", () => {
  it("responds as an event-stream and emits the retry preamble", async () => {
    const response = createSseResponse({
      onStart: async () => undefined,
    });

    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const reader = response.body!.getReader();
    expect(await readText(reader)).toBe("retry: 2000\n\n");
    await reader.cancel();
  });

  describe("slot release on terminal states", () => {
    it("calls onClose when onStart rejects (slot would otherwise leak)", async () => {
      // onStart runs DB/Redis init; a transient failure there rejects start().
      // Per the Streams spec a rejected start() does NOT call cancel(), so without
      // a catch the connection-cap slot (released by onClose) leaks permanently.
      const onClose = vi.fn();

      const response = createSseResponse({
        onStart: () => Promise.reject(new Error("DB down during init")),
        onClose,
      });

      await expect(drainUntilDone(response.body!)).rejects.toThrow("DB down during init");
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("releases the slot and unsubscribes once on client cancel, after heartbeats", async () => {
      const onClose = vi.fn();
      const unsubscribe = vi.fn(async () => {});

      const response = createSseResponse({
        onStart: async () => unsubscribe,
        onClose,
        heartbeatMs: 5,
      });

      // Let start() run to completion (subscription established, heartbeat armed).
      const reader = response.body!.getReader();
      await readText(reader); // retry preamble
      expect(await readText(reader)).toBe(": ping\n\n"); // heartbeat fired

      await reader.cancel();

      expect(unsubscribe).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not throw and releases once when onClose is omitted", async () => {
      const response = createSseResponse({
        onStart: () => Promise.reject(new Error("init failed")),
      });

      await expect(drainUntilDone(response.body!)).rejects.toThrow("init failed");
    });
  });

  describe("cancel during start()", () => {
    it("unsubscribes the late subscription and skips the heartbeat without leaking", async () => {
      const onClose = vi.fn();
      const unsubscribe = vi.fn(async () => {});
      let resolveOnStart!: (sub: () => Promise<void>) => void;
      let sawCancelledDuringStart = false;

      const response = createSseResponse({
        onClose,
        onStart: (_enqueue, isCancelled) =>
          new Promise<() => Promise<void>>((resolve) => {
            resolveOnStart = (sub) => {
              sawCancelledDuringStart = isCancelled();
              resolve(sub);
            };
          }),
      });

      // Cancel before onStart resolves — this drives cancelled = true first.
      await response.body!.cancel();

      // onStart now resolves with a subscription; start() must unsubscribe it.
      resolveOnStart(unsubscribe);
      await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(1));

      expect(sawCancelledDuringStart).toBe(true);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("releases the slot once when onStart returns no subscription after cancel", async () => {
      const onClose = vi.fn();
      let resolveOnStart!: (sub: undefined) => void;

      const response = createSseResponse({
        onClose,
        onStart: () =>
          new Promise<undefined>((resolve) => {
            resolveOnStart = resolve;
          }),
      });

      await response.body!.cancel();
      resolveOnStart(undefined);

      await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });
  });
});

describe("sseEvent", () => {
  it("formats an event with an id", () => {
    expect(sseEvent(7, "snapshot", { a: 1 })).toBe(
      'id: 7\nevent: snapshot\ndata: {"a":1}\n\n',
    );
  });

  it("omits the id line when id is undefined", () => {
    expect(sseEvent(undefined, "snapshot", { a: 1 })).toBe(
      'event: snapshot\ndata: {"a":1}\n\n',
    );
  });
});
