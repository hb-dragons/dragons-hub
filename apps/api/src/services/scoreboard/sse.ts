import { and, eq, gt, asc } from "drizzle-orm";
import { db } from "../../config/database";
import {
  liveScoreboards,
  scoreboardSnapshots,
} from "@dragons/db/schema";
import { subscribeSnapshots } from "./pubsub";
import { createSseResponse, sseEvent } from "./sse-helper";

const REPLAY_LIMIT = 100;

export interface CreateStreamArgs {
  deviceId: string;
  lastEventId: number | undefined;
  onClose?: () => void;
}

export function createScoreboardStream({
  deviceId,
  lastEventId,
  onClose,
}: CreateStreamArgs): Response {
  return createSseResponse({
    onClose,
    onStart: async (enqueue, isCancelled) => {
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
        if (isCancelled()) return undefined;
        for (const row of rows) {
          enqueue(sseEvent(row.id, "snapshot", row));
        }
      } else {
        const live = await db
          .select()
          .from(liveScoreboards)
          .where(eq(liveScoreboards.deviceId, deviceId))
          .limit(1);
        if (isCancelled()) return undefined;
        if (live.length > 0) {
          enqueue(sseEvent(undefined, "snapshot", live[0]));
        }
      }

      return subscribeSnapshots(deviceId, (snap) => {
        const payload = snap as { snapshotId?: number | null };
        const id =
          typeof payload.snapshotId === "number" ? payload.snapshotId : undefined;
        enqueue(sseEvent(id, "snapshot", snap));
      });
    },
  });
}
