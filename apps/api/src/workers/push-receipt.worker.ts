import { Worker, type Job } from "bullmq";
import {
  and,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
} from "drizzle-orm";
import { db } from "../config/database";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { notificationLog, pushDevices } from "@dragons/db/schema";
import { ExpoPushClient } from "../services/notifications/expo-push.client";

const log = logger.child({ service: "push-receipt-worker" });

const POLL_INTERVAL_MS = 15 * 60 * 1000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 5000;

export interface ReconcileResult {
  checked: number;
  delivered: number;
  failed: number;
}

/**
 * Poll Expo Push for receipts of pending sent_ticket rows.
 * Marks delivered/failed, purges push_devices on DeviceNotRegistered.
 *
 * Exported for unit testing.
 */
export async function reconcilePushReceipts(
  client: ExpoPushClient,
): Promise<ReconcileResult> {
  const result: ReconcileResult = { checked: 0, delivered: 0, failed: 0 };

  const pollCutoff = new Date(Date.now() - POLL_INTERVAL_MS);
  const ageCutoff = new Date(Date.now() - MAX_AGE_MS);

  const pending = await db
    .select({
      id: notificationLog.id,
      providerTicketId: notificationLog.providerTicketId,
      recipientToken: notificationLog.recipientToken,
    })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.status, "sent_ticket"),
        isNotNull(notificationLog.providerTicketId),
        gt(notificationLog.createdAt, ageCutoff),
        or(
          isNull(notificationLog.providerReceiptCheckedAt),
          lt(notificationLog.providerReceiptCheckedAt, pollCutoff),
        ),
      ),
    )
    .limit(BATCH_SIZE);

  // Filter rows that still have a ticket (defensive — SQL filter already does this,
  // but keeps types simpler downstream)
  const usable = pending.filter(
    (p): p is { id: number; providerTicketId: string; recipientToken: string | null } =>
      typeof p.providerTicketId === "string" && p.providerTicketId.length > 0,
  );

  if (usable.length === 0) return result;

  result.checked = usable.length;
  const ticketIds = usable.map((p) => p.providerTicketId);

  let receipts: Awaited<ReturnType<ExpoPushClient["getReceipts"]>>;
  try {
    receipts = await client.getReceipts(ticketIds);
  } catch (err) {
    log.error({ err }, "getReceipts failed");
    throw err;
  }

  const now = new Date();
  const tokensToPurge: string[] = [];

  for (const row of usable) {
    const receipt = receipts[row.providerTicketId];

    if (!receipt) {
      // Not ready yet; bump checkedAt to space out polling
      await db
        .update(notificationLog)
        .set({ providerReceiptCheckedAt: now })
        .where(eq(notificationLog.id, row.id));
      continue;
    }

    if (receipt.status === "ok") {
      await db
        .update(notificationLog)
        .set({ status: "delivered", providerReceiptCheckedAt: now })
        .where(eq(notificationLog.id, row.id));
      result.delivered++;
      continue;
    }

    // status === "error"
    const errorCode = receipt.details?.error ?? receipt.message ?? "unknown";
    await db
      .update(notificationLog)
      .set({
        status: "failed",
        providerReceiptCheckedAt: now,
        errorMessage: errorCode,
      })
      .where(eq(notificationLog.id, row.id));
    result.failed++;

    if (errorCode.includes("DeviceNotRegistered") && row.recipientToken) {
      tokensToPurge.push(row.recipientToken);
    }
  }

  if (tokensToPurge.length > 0) {
    await db.delete(pushDevices).where(inArray(pushDevices.token, tokensToPurge));
    log.info({ count: tokensToPurge.length }, "purged invalid push devices");
  }

  return result;
}

let _defaultClient: ExpoPushClient | undefined;
function getDefaultClient(): ExpoPushClient {
  if (!_defaultClient) {
    _defaultClient = new ExpoPushClient({ accessToken: env.EXPO_ACCESS_TOKEN });
  }
  return _defaultClient;
}

/**
 * BullMQ Worker — runs the reconcile on every repeatable job fire.
 * Queue is defined in `workers/queues.ts`. Schedule is created in
 * `workers/queues.ts` via `initializeScheduledJobs()`.
 */
export const pushReceiptWorker = new Worker<unknown>(
  "push-receipt",
  async (_job: Job<unknown>) => {
    const client = getDefaultClient();
    const result = await reconcilePushReceipts(client);
    log.info(result, "push receipt cycle complete");
    return result;
  },
  {
    prefix: "{bull}",
    connection: { url: env.REDIS_URL },
    concurrency: 1,
  },
);

/* v8 ignore next 3 */
pushReceiptWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "push receipt job failed");
});
