/**
 * Where the app sends people for the legal texts and for support.
 *
 * Apple 5.1.1(i), § 5 DDG and § 18 MStV each require the Impressum and the
 * Datenschutzerklärung to be reachable from inside the app; linking to the
 * club site satisfies them (two-click rule, BGH I ZR 228/03). The mailboxes are
 * role addresses on purpose: a member's private address would be published on
 * the store page and break when they leave the club.
 */
export const LEGAL_LINKS = {
  privacy: "https://hbdragons.de/datenschutz",
  imprint: "https://hbdragons.de/impressum",
} as const;

export const SUPPORT_MAILBOX = "app@hbdragons.de";
export const PRIVACY_MAILBOX = "datenschutz@hbdragons.de";

export interface AppVersionInfo {
  version: string | null;
  build: string | null;
}

/** `1.0.0 (5)`; `1.0.0` without a build; `dev` where nothing native reports. */
export function appVersionLabel({ version, build }: AppVersionInfo): string {
  if (!version) return "dev";
  return build ? `${version} (${build})` : version;
}

export function buildMailto({
  to,
  subject,
  body,
}: {
  to: string;
  subject: string;
  body?: string;
}): string {
  const params = [`subject=${encodeURIComponent(subject)}`];
  if (body) params.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${to}?${params.join("&")}`;
}

export function buildSupportMailto(info: AppVersionInfo & { platform: string }): string {
  return buildMailto({
    to: SUPPORT_MAILBOX,
    subject: `Dragons App ${appVersionLabel(info)} ${info.platform} — Support`,
  });
}

/**
 * Accounts are club-provisioned, so deletion is a request to the club, not a
 * self-service action (audit §1.2 item 4). The mail is German regardless of
 * the UI locale: it is read by the Datenschutz mailbox, and the row label the
 * user sees is localized separately.
 */
export function buildDeletionMailto({ email, version }: { email: string; version: string }): string {
  return buildMailto({
    to: PRIVACY_MAILBOX,
    subject: `Dragons App: Konto löschen — ${email}`,
    body: [
      `Bitte löscht mein Konto in der Dragons App (${email}).`,
      "",
      `App-Version: ${version}`,
      "",
      "Mir ist bekannt, dass das Konto und die dazugehörigen Geräte-Tokens innerhalb von 30 Tagen gelöscht werden.",
    ].join("\n"),
  });
}
