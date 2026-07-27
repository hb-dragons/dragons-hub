import { env } from "../../../config/env";

export interface SmtpSettings {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

/**
 * The SMTP relay configuration, or null when it is incomplete.
 *
 * All five vars or nothing: a relay host with no credentials, or credentials
 * with no `From`, cannot produce a delivered message, so a partial set reads as
 * "not configured" instead of failing once per notification.
 *
 * Lives apart from the adapter so the provider-availability endpoint can ask the
 * same question without importing nodemailer and the notification-log writer.
 * Both callers applying one rule is what stops the endpoint advertising a relay
 * the adapter would then refuse to use.
 */
export function readSmtpSettings(): SmtpSettings | null {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM) {
    return null;
  }
  return {
    host: SMTP_HOST,
    port: SMTP_PORT,
    user: SMTP_USER,
    password: SMTP_PASSWORD,
    from: SMTP_FROM,
  };
}
