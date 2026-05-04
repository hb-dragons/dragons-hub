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

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue: SafeEnqueue = (text) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // controller already closed
        }
      };

      enqueue("retry: 2000\n\n");

      const sub = await onStart(enqueue, () => cancelled);
      if (cancelled) {
        if (sub) await sub();
        return;
      }
      unsubscribe = sub;
      heartbeat = setInterval(() => enqueue(": ping\n\n"), heartbeatMs);
    },
    async cancel() {
      cancelled = true;
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) await unsubscribe();
      if (!released && onClose) {
        released = true;
        onClose();
      }
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
