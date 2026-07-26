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
 * It comes back when an SMTP adapter exists, not before.
 */
export const CHANNEL_TYPES = [
  "in_app",
  "whatsapp_group",
  "push",
] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];
export type DigestMode = "per_sync" | "scheduled" | "none";

// ── Per-channel config shapes ───────────────────────────────────────────────

export interface InAppConfig {
  audienceRole: "admin" | "referee";
  locale: "de" | "en";
}

export interface WhatsAppGroupConfig {
  groupId: string;
  locale: "de" | "en";
}

export interface PushConfig {
  provider: "expo";
  locale?: "de" | "en";
}

export type ChannelConfig = InAppConfig | WhatsAppGroupConfig | PushConfig;

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

export interface ProviderStatus {
  configured: boolean;
}

export type ProviderAvailability = Record<ChannelType, ProviderStatus>;

// ── Request body types ───────────────────────────────────────────────────────

export interface CreateChannelConfigBody {
  name: string;
  type: ChannelType;
  enabled?: boolean;
  config: ChannelConfig;
  digestMode?: DigestMode;
  digestCron?: string | null;
  digestTimezone?: string;
}

export interface UpdateChannelConfigBody {
  name?: string;
  enabled?: boolean;
  config?: ChannelConfig;
  digestMode?: DigestMode;
  digestCron?: string | null;
  digestTimezone?: string;
}
