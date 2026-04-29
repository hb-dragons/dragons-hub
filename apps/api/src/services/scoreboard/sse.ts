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
}

function sseEvent(id: number | string, name: string, data: unknown): string {
  return `id: ${id}\nevent: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function createScoreboardStream({
  deviceId,
  lastEventId,
}: CreateStreamArgs): Response {
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => Promise<void>) | undefined;

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
        for (const row of rows) {
          safeEnqueue(sseEvent(row.id, "snapshot", row));
        }
      } else {
        const live = await db
          .select()
          .from(liveScoreboards)
          .where(eq(liveScoreboards.deviceId, deviceId))
          .limit(1);
        if (live.length > 0) {
          safeEnqueue(sseEvent(0, "snapshot", live[0]));
        }
      }

      unsubscribe = await subscribeSnapshots(deviceId, (snap) => {
        const payload = snap as { snapshotId?: number };
        safeEnqueue(
          sseEvent(payload.snapshotId ?? 0, "snapshot", snap),
        );
      });

      heartbeat = setInterval(() => safeEnqueue(": ping\n\n"), HEARTBEAT_MS);
    },
    async cancel() {
      if (heartbeat) clearInterval(heartbeat);
      if (unsubscribe) await unsubscribe();
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
