import nodemailer from "nodemailer";
import { eq } from "drizzle-orm";
import { formatKickoffDayShort, toClubDateString, type AccountClosureRequest } from "@dragons/shared";
import { accountClosureRequests } from "@dragons/db/schema";
import { getDb } from "../../config/database";
import { logger } from "../../config/logger";
import { readSmtpSettings } from "../notifications/channels/smtp-settings";
import { smtpTransportOptions } from "../notifications/channels/email";

const log = logger.child({ service: "account-closure" });

/**
 * The club's Datenschutz inbox, which carries out closure requests (ADR-0013).
 * A role address the published Datenschutzerklärung names, so it is a constant
 * rather than configuration, the same as the app's legal links.
 */
export const DATENSCHUTZ_MAILBOX = "datenschutz@hbdragons.de";

/** The account a request is made for, as the session knows it. */
export interface ClosureAccount {
  id: string;
  name: string;
  email: string;
}

function toResponse(row: { requestedAt: Date }): AccountClosureRequest {
  return { requestedAt: row.requestedAt.toISOString() };
}

/** The account's closure request, or `null` before one exists. */
export async function getAccountClosureRequest(userId: string): Promise<AccountClosureRequest | null> {
  const [row] = await getDb()
    .select({ requestedAt: accountClosureRequests.requestedAt })
    .from(accountClosureRequests)
    .where(eq(accountClosureRequests.userId, userId));
  return row ? toResponse(row) : null;
}

/**
 * Record a closure request for the account, once (#400).
 *
 * `ON CONFLICT DO NOTHING` on the unique user id makes the insert itself the
 * idempotency check: of two concurrent taps only one returns a row, so only
 * one mail goes out. A repeat reads back the request already on file.
 *
 * Store, then notify, as Probetraining submissions do: the row is the record
 * the club acts on, so a missing or failing relay never loses it.
 */
export async function requestAccountClosure(
  account: ClosureAccount,
): Promise<{ request: AccountClosureRequest; created: boolean }> {
  const [inserted] = await getDb()
    .insert(accountClosureRequests)
    .values({ userId: account.id })
    .onConflictDoNothing({ target: accountClosureRequests.userId })
    .returning({ requestedAt: accountClosureRequests.requestedAt });

  if (inserted) {
    await notifyDatenschutz(account, inserted.requestedAt);
    return { request: toResponse(inserted), created: true };
  }

  const existing = await getAccountClosureRequest(account.id);
  // The conflict proves a row exists; it can vanish only if the account was
  // deleted between the two statements, and then the session is gone too.
  if (!existing) throw new Error("Account closure request disappeared after a conflict");
  return { request: existing, created: false };
}

/**
 * Mail the Datenschutz inbox, reply-to the account. Never throws: the request
 * is already stored and the caller answers 201 either way.
 */
async function notifyDatenschutz(account: ClosureAccount, requestedAt: Date): Promise<void> {
  const settings = readSmtpSettings();
  if (!settings) {
    log.warn("Account closure notification mail skipped: SMTP is not configured");
    return;
  }

  const transport = nodemailer.createTransport(smtpTransportOptions(settings));
  try {
    await transport.sendMail({
      from: settings.from,
      to: DATENSCHUTZ_MAILBOX,
      replyTo: account.email,
      subject: `Dragons App: Schließung des Kontos beantragt — ${account.email}`,
      text: renderNotificationText(account, requestedAt),
    });
  } catch (err) {
    log.error({ err }, "Account closure notification mail failed");
  } finally {
    transport.close();
  }
}

function renderNotificationText(account: ClosureAccount, requestedAt: Date): string {
  return [
    "In der Dragons App wurde die Schließung eines Kontos beantragt.",
    "",
    `Name: ${account.name}`,
    `E-Mail: ${account.email}`,
    `Beantragt am: ${formatKickoffDayShort(toClubDateString(requestedAt), "de-DE")}`,
    "",
    "Das Konto wird in der Web-Administration deaktiviert oder gelöscht.",
    "Schiedsrichter- und Personendaten, mit denen das Konto verknüpft ist, bleiben bestehen.",
  ].join("\n");
}
