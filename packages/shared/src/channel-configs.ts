// ── Channel types ────────────────────────────────────────────────────────────

/**
 * Every deliverable notification channel. Single source of truth — the request
 * contract (`@dragons/contracts`), the watch-rule channel target and the
 * provider-availability response all derive from this array rather than
 * restating the literals.
 *
 * A channel belongs here only once `dispatchImmediate` can actually deliver it
 * (`DISPATCHABLE_CHANNEL_TYPES` in the API's notification pipeline is exhaustive
 * over this type, so adding one without an adapter is a compile error). `email`
 * was listed here with no adapter behind it, which let an admin create a
 * channel config whose every notification fell through to
 * "Unknown channel type, skipping dispatch" — configured, enabled, and silent.
 * It is back because `channels/email.ts` now delivers it over SMTP.
 */
export const CHANNEL_TYPES = [
  "in_app",
  "whatsapp_group",
  "push",
  "email",
  "webhook",
] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];
/**
 * How a channel batches its notifications. Single source of truth — the request
 * contract (`@dragons/contracts`) derives its enum from this array, and
 * `apps/api/src/test/enum-column-values.test.ts` asserts that no
 * `channel_configs.digest_mode` value in a migration-built database falls
 * outside it.
 *
 * `none` means "deliver each notification as it happens": the worker only
 * buffers for `per_sync` and only schedules a cron digest for `scheduled`.
 * Migration 0030 seeded the push channel with `immediate`, a value from
 * `EVENT_URGENCIES` rather than this array — it behaved like `none` by falling
 * through both comparisons, and 0043 rewrites it to `none`.
 */
export const DIGEST_MODES = ["per_sync", "scheduled", "none"] as const;
export type DigestMode = (typeof DIGEST_MODES)[number];

// ── Per-channel config shapes ───────────────────────────────────────────────

interface InAppConfig {
  audienceRole: "admin" | "referee";
  locale: "de" | "en";
}

export interface WhatsAppGroupConfig {
  groupId: string;
  locale: "de" | "en";
}

interface PushConfig {
  provider: "expo";
  locale?: "de" | "en";
}

/**
 * Email carries no target of its own. The pipeline's recipient key resolves to
 * user ids and the adapter reads each user's own address, so the config only
 * pins the language the message body is rendered in.
 */
interface EmailConfig {
  locale: "de" | "en";
}

/**
 * Outbound webhook. The only kind so far is a GitHub `repository_dispatch` —
 * `kind` is the discriminant future webhook kinds extend, so a persisted
 * config always says what protocol its remaining fields configure.
 */
export interface WebhookConfig {
  kind: "github_repository_dispatch";
  owner: string;
  repo: string;
  eventType: string;
}

export type ChannelConfig =
  | InAppConfig
  | WhatsAppGroupConfig
  | PushConfig
  | EmailConfig
  | WebhookConfig;

// ── API response types ───────────────────────────────────────────────────────

export interface ChannelConfigItem {
  id: number;
  name: string;
  type: ChannelType;
  enabled: boolean;
  config: ChannelConfig;
  digestMode: DigestMode;
  digestCron: string | null;
  digestTimezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelConfigListResult {
  configs: ChannelConfigItem[];
  total: number;
}

// ── Provider availability ───────────────────────────────────────────────────

interface ProviderStatus {
  configured: boolean;
}

export type ProviderAvailability = Record<ChannelType, ProviderStatus>;

// Request body types live in `@dragons/contracts` (channel-config.ts) — the zod
// schema is the single source of truth, and restating them here let the two
// drift apart.
