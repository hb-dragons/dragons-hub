import type { ChannelType } from "./channel-configs";

// ── Filter & channel types ───────────────────────────────────────────────────

export interface FilterCondition {
  field: "teamId" | "leagueId" | "venueId" | "source";
  operator: "eq" | "neq" | "in" | "any";
  value: string | string[] | null;
}

export interface ChannelTarget {
  channel: ChannelType;
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

// Request body types live in `@dragons/contracts` (watch-rule.ts) as
// `WatchRuleCreateBody` / `WatchRuleUpdateBody`, inferred from the zod schemas
// the routes validate with.
