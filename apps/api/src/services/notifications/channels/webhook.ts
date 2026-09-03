import { eq } from "drizzle-orm";
import { getDb } from "../../../config/database";
import { notificationLog } from "@dragons/db/schema";
import type { WebhookConfig } from "@dragons/shared";
import { insertNotificationLogDeduped } from "../notification-log-dedup";
import type { ChannelSendParams, DeliveryResult } from "./types";
import { env } from "../../../config/env";
import { logger } from "../../../config/logger";
import { postRepositoryDispatch } from "../../github-dispatch";

const log = logger.child({ service: "webhook-adapter" });

/**
 * Outbound `webhook` channel. The only kind so far is a GitHub
 * `repository_dispatch`: one POST per event to
 * `/repos/{owner}/{repo}/dispatches`, authenticated with the fine-grained PAT
 * in `GH_DISPATCH_TOKEN` (resolves the AGENTS.md poller-vs-webhook deferral —
 * a finished sync triggers a site rebuild instead of the site polling).
 *
 * Failure contract: this adapter never throws. A missing token is a logged
 * skip and any GitHub answer or network error is logged and reported as
 * `success: false` — a broken dispatch must never poison the notification
 * pipeline, and the daily rebuild cron is the safety net for a lost dispatch.
 */
export class WebhookChannelAdapter {
  async send(params: ChannelSendParams, config: WebhookConfig): Promise<DeliveryResult> {
    const token = env.GH_DISPATCH_TOKEN;
    if (!token) {
      log.warn(
        { channelConfigId: params.channelConfigId, eventId: params.eventId },
        "GH_DISPATCH_TOKEN not configured, skipping webhook dispatch",
      );
      return { success: false, error: "GH_DISPATCH_TOKEN not configured" };
    }

    // Claim a notification_log row first, exactly as the WhatsApp adapter
    // does: the dedup unique index
    // (event_id, channel_config_id, COALESCE(recipient_id,'__group__')) makes
    // a re-processed event a no-op instead of a second repository_dispatch,
    // and the row is this channel's delivery audit trail.
    let claimId: number;
    try {
      const rows = await insertNotificationLogDeduped(getDb(), {
        eventId: params.eventId,
        watchRuleId: params.watchRuleId,
        channelConfigId: params.channelConfigId,
        recipientId: params.recipientId,
        title: params.title,
        body: params.body,
        locale: params.locale,
        status: "pending",
      });

      if (rows.length === 0) {
        // Already dispatched for this event/channel — skip the send.
        return { success: true, duplicate: true };
      }
      claimId = rows[0]!.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      log.error({ err, eventId: params.eventId }, "Failed to record webhook notification");
      return { success: false, error: message };
    }

    // Release the claim on any failure so the event stays retryable.
    const releaseClaim = async () => {
      try {
        await getDb().delete(notificationLog).where(eq(notificationLog.id, claimId));
      } catch (err) {
        log.error({ err, claimId }, "Failed to release webhook claim row");
      }
    };

    const result = await postRepositoryDispatch({
      owner: config.owner,
      repo: config.repo,
      token,
      eventType: config.eventType,
      clientPayload: { eventId: params.eventId },
    });

    if (!result.ok) {
      log.error(
        { status: result.status, errorText: result.error, owner: config.owner, repo: config.repo },
        "GitHub repository_dispatch failed",
      );
      await releaseClaim();
      // `status: 0` means the request never got an answer (timeout, DNS, a
      // dropped connection), which is not a status GitHub returned.
      return {
        success: false,
        error:
          result.status === 0
            ? result.error
            : `GitHub dispatch error ${result.status}: ${result.error}`,
      };
    }

    try {
      await getDb()
        .update(notificationLog)
        .set({ status: "sent", sentAt: new Date() })
        .where(eq(notificationLog.id, claimId));
    } catch (err) {
      // The dispatch is already out, so failing to mark the row strands it as
      // `pending` but must not report the send as failed.
      log.error({ err, claimId }, "Failed to mark webhook notification as sent");
    }

    log.info(
      { owner: config.owner, repo: config.repo, eventType: config.eventType, eventId: params.eventId },
      "Webhook repository_dispatch sent",
    );
    return { success: true };
  }
}
