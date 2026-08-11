import { eq, inArray } from "drizzle-orm";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { getDb } from "../../../config/database";
import { notificationLog } from "@dragons/db/schema";
import { logger } from "../../../config/logger";
import { insertNotificationLogDeduped } from "../notification-log-dedup";
import { buildUnsubscribeUrl } from "../email-subscription.service";
import { resolveEmailRecipients } from "../recipient-resolver";
import { renderEmailMessage } from "../templates/email";
import { readSmtpSettings, type SmtpSettings } from "./smtp-settings";

const log = logger.child({ service: "email-adapter" });

export interface EmailSendParams {
  eventId: string;
  watchRuleId: number | null;
  channelConfigId: number;
  recipientUserIds: string[];
  title: string;
  body: string;
  locale: string;
  /** Absolute URL for the "open in Dragons Hub" call to action, when the event has one. */
  link?: string;
}

export interface EmailSendResult {
  success: boolean;
  sent: number;
  failed: number;
  /**
   * Recipients withheld before any send: unverified addresses, ids with no
   * account, and members who unsubscribed from email (issue #134).
   */
  skipped: number;
}

/**
 * Split out from `createTransport` so the port→TLS rule can be asserted without
 * opening a socket.
 */
export function smtpTransportOptions(settings: SmtpSettings): SMTPTransport.Options {
  return {
    host: settings.host,
    port: settings.port,
    // 465 is implicit TLS. Every other port starts plaintext and upgrades via
    // STARTTLS, which is what `secure: false` means to nodemailer — it is not
    // "no encryption", and nodemailer does not infer either from the port.
    secure: settings.port === 465,
    auth: { user: settings.user, pass: settings.password },
  };
}

/**
 * Transport choice: **nodemailer**.
 *
 * The channel this adapter implements is SMTP — its configuration is
 * `SMTP_HOST/PORT/USER/PASSWORD/FROM`, a relay the club already pays for, not a
 * vendor account. nodemailer is the maintained Node SMTP client for exactly
 * that: it builds the multipart/alternative MIME envelope from `{text, html}`
 * in one call, negotiates TLS (implicit on 465, STARTTLS elsewhere) and handles
 * AUTH — none of which is worth reimplementing over a socket.
 *
 * A provider SDK (Resend, Postmark, SES) was not chosen: each replaces the SMTP
 * contract with a vendor API key, pins the club to one relay, and cannot be
 * pointed at a local server — which is what lets `email.test.ts` verify
 * delivery against a real received message instead of a mocked client that
 * returns success.
 *
 * One transport per `send()`, closed in the caller's `finally`. Notification
 * volume is a handful of messages per event, so a pooled connection held open
 * between events would buy nothing and leak a socket into every idle worker.
 */
function createTransport(settings: SmtpSettings): Transporter {
  return nodemailer.createTransport(smtpTransportOptions(settings));
}

export class EmailChannelAdapter {
  async send(params: EmailSendParams): Promise<EmailSendResult> {
    const result: EmailSendResult = { success: true, sent: 0, failed: 0, skipped: 0 };

    const settings = readSmtpSettings();
    if (!settings) {
      log.warn("SMTP is not configured, skipping email delivery");
      return { ...result, success: false };
    }

    const { deliverable, skipped } = await resolveEmailRecipients(
      params.recipientUserIds,
    );
    result.skipped = skipped.length;
    for (const entry of skipped) {
      log.warn(
        { userId: entry.userId, reason: entry.reason, eventId: params.eventId },
        "Email recipient skipped",
      );
    }
    if (deliverable.length === 0) return result;

    // Claim one notification_log row per recipient BEFORE sending, exactly as
    // the push adapter does: the dedup index
    // (event_id, channel_config_id, COALESCE(recipient_id,'__group__')) turns a
    // re-processed outbox event into a no-op instead of a second copy in the
    // member's inbox.
    const claimed = await insertNotificationLogDeduped(
      getDb(),
      deliverable.map((recipient) => ({
        eventId: params.eventId,
        watchRuleId: params.watchRuleId,
        channelConfigId: params.channelConfigId,
        recipientId: recipient.userId,
        title: params.title,
        body: params.body,
        locale: params.locale,
        status: "pending",
      })),
    );

    const claimIdByUser = new Map<string, number>();
    for (const row of claimed) {
      if (row.recipientId) claimIdByUser.set(row.recipientId, row.id);
    }

    const toSend = deliverable.filter((r) => claimIdByUser.has(r.userId));
    if (toSend.length === 0) return result;

    const transport = createTransport(settings);
    const releasedClaimIds: number[] = [];

    try {
      for (const recipient of toSend) {
        const claimId = claimIdByUser.get(recipient.userId)!;
        // Rendered per recipient, not per message: the unsubscribe token
        // identifies exactly one member, so no two copies are the same bytes.
        const unsubscribeUrl = buildUnsubscribeUrl(
          recipient.unsubscribeToken,
          params.locale,
        );
        const message = renderEmailMessage(
          { title: params.title, body: params.body },
          params.locale,
          params.link,
          unsubscribeUrl,
        );
        try {
          const info = await transport.sendMail({
            from: settings.from,
            // Structured, not interpolated: a display name containing `<`, `"`
            // or a comma would otherwise rewrite the To header it sits in.
            to: { name: recipient.name, address: recipient.address },
            subject: message.subject,
            text: message.text,
            html: message.html,
            headers: {
              // RFC 2369 + RFC 8058. The header is what a mail client's own
              // "unsubscribe" button uses; `List-Unsubscribe-Post` is what
              // makes that button a single POST instead of sending the member
              // to a page. Both are required for one-click: a client that sees
              // only the URL falls back to opening it, which is a GET and
              // therefore the confirmation page, never a silent opt-out.
              "List-Unsubscribe": `<${unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          });

          await getDb()
            .update(notificationLog)
            .set({
              status: "sent",
              sentAt: new Date(),
              // The relay's Message-ID: the only handle a later bounce
              // investigation has on this send.
              providerTicketId: info.messageId,
              recipientToken: recipient.address,
            })
            .where(eq(notificationLog.id, claimId));
          result.sent++;
        } catch (err) {
          // Release rather than mark failed. SMTP rejections here are relay-
          // level (connection refused, auth failure, greylisting) and clear on
          // their own; a released claim is what lets the outbox re-deliver.
          // A *bounce* — the relay accepted and the far side later refused — is
          // a different signal that never reaches this call and is out of scope.
          log.error(
            { err, userId: recipient.userId, eventId: params.eventId },
            "SMTP send failed",
          );
          releasedClaimIds.push(claimId);
          result.failed++;
        }
      }
    } finally {
      transport.close();
    }

    if (releasedClaimIds.length > 0) {
      await getDb()
        .delete(notificationLog)
        .where(inArray(notificationLog.id, releasedClaimIds));
    }

    if (result.failed > 0) result.success = false;
    return result;
  }
}
