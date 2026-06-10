// Domain event shapes live in @dragons/shared (the API's
// DomainEventItem/ListResult); re-export so call sites keep one name.
export type { DomainEventItem, DomainEventListResult } from "@dragons/shared";

// Notification Center response shapes live in @dragons/shared (the API's
// NotificationCenterItem/ListResult); re-export so call sites keep one name.
export type {
  NotificationItem,
  NotificationListResult,
} from "@dragons/shared";

// Failed notification shapes live in @dragons/shared (the API's
// FailedNotificationItem/ListResult); re-export so call sites keep one name.
export type {
  FailedNotificationItem,
  FailedNotificationListResult,
} from "@dragons/shared";

// Watch rule shapes live in @dragons/shared (the API's
// WatchRuleItem/ListResult + FilterCondition/ChannelTarget); re-export so
// call sites keep one name.
export type {
  WatchRuleItem,
  WatchRuleListResult,
  FilterCondition,
  ChannelTarget,
} from "@dragons/shared";

// Channel config shapes
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

// Channel config from GET /admin/channel-configs
export interface ChannelConfigItem {
  id: number;
  name: string;
  type: "in_app" | "whatsapp_group" | "email";
  enabled: boolean;
  config: ChannelConfig;
  digestMode: "per_sync" | "scheduled" | "none";
  digestCron: string | null;
  digestTimezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelConfigListResult {
  configs: ChannelConfigItem[];
  total: number;
}

export interface ProviderStatus {
  configured: boolean;
}

export type ProviderAvailability = Record<string, ProviderStatus>;

// Trigger event body is the request contract; re-export from the API client
// (inferred from @dragons/contracts) so call sites keep one name.
export type { TriggerEventBody } from "@dragons/api-client";
