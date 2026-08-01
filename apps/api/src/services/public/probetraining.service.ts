import nodemailer from "nodemailer";
import type { ProbetrainingRequest } from "@dragons/contracts";
import { probetrainingSubmissions } from "@dragons/db/schema";
import { getDb } from "../../config/database";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { incrementWithTtl } from "../../config/redis";
import { readSmtpSettings } from "../notifications/channels/smtp-settings";
import { smtpTransportOptions } from "../notifications/channels/email";

const log = logger.child({ service: "probetraining" });

/** Fixed window: at most this many submissions per IP per hour. */
const RATE_LIMIT = 5;
const RATE_WINDOW_SECONDS = 3600;

/**
 * What became of a submission. The route maps `rate_limited` to a 429;
 * `accepted` and `dropped` both answer 201 `{ ok: true }` — a bot that filled
 * the honeypot must not learn it was detected.
 */
export type ProbetrainingOutcome = "accepted" | "dropped" | "rate_limited";

/**
 * Handle one public Probetraining submission.
 *
 * Order matters:
 *
 * 1. **Honeypot first, before any side effect.** A filled `website` field means
 *    a bot; the request produces no row, no mail, and not even a Redis INCR —
 *    silence is the whole point.
 * 2. **Rate limit** per IP, fixed one-hour window in Redis (`INCR` + `EXPIRE`
 *    in one atomic script — see `incrementWithTtl`). The IP lives only in
 *    Redis under that TTL, never in the database (GDPR minimization; the
 *    table deliberately has no IP column). A Redis outage fails open: losing
 *    the limiter for a blip is better than turning away a genuine request.
 * 3. **Store, then notify.** The row is the record; the mail is a convenience.
 *    A failing SMTP relay must not lose the submission, so the mail step can
 *    only log, never throw (delivery is separately gated at cutover).
 */
export async function submitProbetraining(
  input: ProbetrainingRequest,
  ip: string,
): Promise<ProbetrainingOutcome> {
  // Defense in depth: the route's honeypot guard already short-circuits filled
  // honeypots before validation (post-validation `website` can only be empty),
  // so through HTTP this branch is unreachable. It stays so the no-side-effects
  // guarantee holds for any future caller of this service, not just the route.
  if (input.website) return "dropped";

  let requestsThisHour: number;
  try {
    requestsThisHour = await incrementWithTtl(`probetraining:${ip}`, RATE_WINDOW_SECONDS);
  } catch (err) {
    log.warn({ err }, "Probetraining rate limiter Redis error; failing open");
    requestsThisHour = 1;
  }
  if (requestsThisHour > RATE_LIMIT) return "rate_limited";

  await getDb().insert(probetrainingSubmissions).values({
    month: input.month,
    year: input.year,
    didPlay: input.didPlay,
    gender: input.gender,
    mail: input.mail,
    message: input.message ?? null,
    acceptedPrivacy: input.acceptedPrivacy,
  });

  await notifyClubInbox(input);
  return "accepted";
}

/**
 * Send the notification mail to the club inbox, reply-to the submitter.
 * Never throws: the row is already stored and the caller answers 201 either
 * way. A throwing transport ends in the `console.error` the plan prescribes;
 * a missing configuration is a documented-normal state (see `.env.example`)
 * and only warns.
 */
async function notifyClubInbox(input: ProbetrainingRequest): Promise<void> {
  const settings = readSmtpSettings();
  const to = env.PROBETRAINING_NOTIFY_TO;
  if (!settings || !to) {
    log.warn(
      "Probetraining notification mail skipped: SMTP or PROBETRAINING_NOTIFY_TO is not configured",
    );
    return;
  }

  const transport = nodemailer.createTransport(smtpTransportOptions(settings));
  try {
    await transport.sendMail({
      from: settings.from,
      to,
      replyTo: input.mail,
      subject: "Neue Probetraining-Anfrage",
      text: renderNotificationText(input),
    });
  } catch (err) {
    console.error("Probetraining notification mail failed", err);
  } finally {
    transport.close();
  }
}

function renderNotificationText(input: ProbetrainingRequest): string {
  return [
    "Neue Probetraining-Anfrage über die Website:",
    "",
    `Geburtsmonat: ${input.month}`,
    `Geburtsjahr: ${input.year}`,
    `Schon im Verein gespielt: ${input.didPlay ? "Ja" : "Nein"}`,
    `Geschlecht: ${input.gender}`,
    `E-Mail: ${input.mail}`,
    "",
    "Nachricht:",
    input.message ?? "(keine Nachricht)",
  ].join("\n");
}
