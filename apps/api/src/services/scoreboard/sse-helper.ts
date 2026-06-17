const HEARTBEAT_MS = 15_000;

export type SafeEnqueue = (text: string) => void;

export interface SseStreamArgs {
  onStart: (
    enqueue: SafeEnqueue,
    isCancelled: () => boolean,
  ) => Promise<(() => Promise<void>) | undefined>;
  onClose?: () => void;
  heartbeatMs?: number;
}

export function createSseResponse({
  onStart,
  onClose,
  heartbeatMs = HEARTBEAT_MS,
}: SseStreamArgs): Response {
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => Promise<void>) | undefined;
  let cancelled = false;
  let released = false;

  // Centralized cleanup. Runs on every terminal state — a client-initiated
  // cancel() AND a failed start() — so the connection-cap slot (onClose) is
  // released exactly once. Per the Streams spec a rejected start() does not
  // call cancel(), so without this the slot would leak on any init failure.
  const release = async () => {
    if (heartbeat) clearInterval(heartbeat);
    if (unsubscribe) await unsubscribe();
    if (!released && onClose) {
      released = true;
      onClose();
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue: SafeEnqueue = (text) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // controller already closed
        }
      };

      try {
        enqueue("retry: 2000\n\n");

        const sub = await onStart(enqueue, () => cancelled);
        if (cancelled) {
          if (sub) await sub();
          return;
        }
        unsubscribe = sub;
        heartbeat = setInterval(() => enqueue(": ping\n\n"), heartbeatMs);
      } catch (err) {
        cancelled = true;
        await release();
        // controller.error() is a no-op once the stream has left the "readable"
        // state (e.g. an earlier cancel()), so it is safe on every catch path.
        controller.error(err);
      }
    },
    async cancel() {
      cancelled = true;
      await release();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    },
  });
}

export function sseEvent(
  id: number | undefined,
  name: string,
  data: unknown,
): string {
  const idLine = typeof id === "number" ? `id: ${id}\n` : "";
  return `${idLine}event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}
