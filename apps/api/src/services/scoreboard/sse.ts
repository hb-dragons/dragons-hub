import { and, eq, gt, asc } from "drizzle-orm";
import { db } from "../../config/database";
import {
  liveScoreboards,
  scoreboardSnapshots,
} from "@dragons/db/schema";
import { subscribeSnapshots } from "./pubsub";

const HEARTBEAT_MS = 15_000;
const REPLAY_LIMIT = 100;

export interface CreateStreamArgs {
  deviceId: string;
  lastEventId: number | undefined;
  onClose?: () => void;
}

function sseEvent(
  id: number | undefined,
  name: string,
  data: unknown,
): string {
  const idLine = typeof id === "number" ? `id: ${id}\n` : "";
  return `${idLine}event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function createScoreboardStream({
  deviceId,
  lastEventId,
  onClose,
}: CreateStreamArgs): Response {
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => Promise<void>) | undefined;
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function safeEnqueue(text: string) {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // controller already closed
        }
      }

      safeEnqueue("retry: 2000\n\n");

      if (lastEventId !== undefined) {
        const rows = await db
          .select()
          .from(scoreboardSnapshots)
          .where(
            and(
              eq(scoreboardSnapshots.deviceId, deviceId),
              gt(scoreboardSnapshots.id, lastEventId),
            ),
          )
          .orderBy(asc(scoreboardSnapshots.id))
          .limit(REPLAY_LIMIT);
        if (cancelled) return;
        for (const row of rows) {
          safeEnqueue(sseEvent(row.id, "snapshot", row));
        }
      } else {
        const live = await db
          .select()
          .from(liveScoreboards)
          .where(eq(liveScoreboards.deviceId, deviceId))
          .limit(1);
        if (cancelled) return;
        if (live.length > 0) {
          // No snapshot id is known on a fresh fetch from the live row alone;
          // omit the id line so the browser keeps its prior Last-Event-ID.
          safeEnqueue(sseEvent(undefined, "snapshot", live[0]));
        }
      }

      const sub = await subscribeSnapshots(deviceId, (snap) => {
        const payload = snap as { snapshotId?: number | null };
        const id =
          typeof payload.snapshotId === "number" ? payload.snapshotId : undefined;
        safeEnqueue(sseEvent(id, "snapshot", snap));
      });
      if (cancelled) {
        await sub();
        return;
      }
      unsubscribe = sub;

      heartbeat = setInterval(() => safeEnqueue(": ping\n\n"), HEARTBEAT_MS);
    },
    async cancel() {
      cancelled = true;
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) await unsubscribe();
      if (onClose) onClose();
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
