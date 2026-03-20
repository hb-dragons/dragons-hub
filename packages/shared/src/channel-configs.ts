// ── Channel types ────────────────────────────────────────────────────────────

export type ChannelType = "in_app" | "whatsapp_group" | "email";
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

export interface EmailConfig {
  locale: "de" | "en";
}

export type ChannelConfig = InAppConfig | WhatsAppGroupConfig | EmailConfig;

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
