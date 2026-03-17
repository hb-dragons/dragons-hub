// ── Channel types ────────────────────────────────────────────────────────────

export type ChannelType = "in_app" | "whatsapp_group" | "push" | "email";
export type DigestMode = "per_sync" | "scheduled" | "none";

// ── API response types ───────────────────────────────────────────────────────

export interface ChannelConfigItem {
  id: number;
  name: string;
  type: ChannelType;
  enabled: boolean;
  config: Record<string, unknown>;
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

// ── Request body types ───────────────────────────────────────────────────────

export interface CreateChannelConfigBody {
  name: string;
  type: ChannelType;
  enabled?: boolean;
  config?: Record<string, unknown>;
  digestMode?: DigestMode;
  digestCron?: string | null;
  digestTimezone?: string;
}

export interface UpdateChannelConfigBody {
  name?: string;
  type?: ChannelType;
  enabled?: boolean;
  config?: Record<string, unknown>;
  digestMode?: DigestMode;
  digestCron?: string | null;
  digestTimezone?: string;
}
