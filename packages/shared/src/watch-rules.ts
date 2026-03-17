// ── Filter & channel types ───────────────────────────────────────────────────

export interface FilterCondition {
  field: "teamId" | "leagueId" | "venueId" | "source";
  operator: "eq" | "neq" | "in" | "any";
  value: string | string[] | null;
}

export interface ChannelTarget {
  channel: "in_app" | "whatsapp_group" | "push" | "email";
  targetId: string;
}

// ── API response types ───────────────────────────────────────────────────────

export interface WatchRuleItem {
  id: number;
  name: string;
  enabled: boolean;
  createdBy: string;
  eventTypes: string[];
  filters: FilterCondition[];
  channels: ChannelTarget[];
  urgencyOverride: string | null;
  templateOverride: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WatchRuleListResult {
  rules: WatchRuleItem[];
  total: number;
}

// ── Request body types ───────────────────────────────────────────────────────

export interface CreateWatchRuleBody {
  name: string;
  enabled?: boolean;
  eventTypes: string[];
  filters?: FilterCondition[];
  channels: ChannelTarget[];
  urgencyOverride?: string | null;
  templateOverride?: string | null;
}

export interface UpdateWatchRuleBody {
  name?: string;
  enabled?: boolean;
  eventTypes?: string[];
  filters?: FilterCondition[];
  channels?: ChannelTarget[];
  urgencyOverride?: string | null;
  templateOverride?: string | null;
}
