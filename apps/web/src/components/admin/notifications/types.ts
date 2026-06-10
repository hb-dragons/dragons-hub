// Domain event from GET /admin/events
export interface DomainEventItem {
  id: string;
  type: string;
  source: "sync" | "manual" | "reconciliation";
  urgency: "immediate" | "routine";
  occurredAt: string;
  actor: string | null;
  syncRunId: number | null;
  entityType: "match" | "booking" | "referee";
  entityId: number;
  entityName: string;
  deepLinkPath: string;
  enqueuedAt: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface DomainEventListResult {
  events: DomainEventItem[];
  total: number;
}

// Notification Center response shapes live in @dragons/shared (the API's
// NotificationCenterItem/ListResult); re-export so call sites keep one name.
export type {
  NotificationItem,
  NotificationListResult,
} from "@dragons/shared";

// Failed notification from GET /admin/events/failed
export interface FailedNotificationItem {
  id: number;
  eventId: string;
  watchRuleId: number | null;
  channelConfigId: number;
  recipientId: string | null;
  title: string;
  body: string;
  locale: string;
  status: string;
  errorMessage: string | null;
  retryCount: number;
  createdAt: string;
  eventType: string;
  entityName: string;
  deepLinkPath: string;
}

export interface FailedNotificationListResult {
  notifications: FailedNotificationItem[];
  total: number;
}

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

// Trigger event body
export interface TriggerEventBody {
  type: string;
  entityType: "match" | "booking" | "referee";
  entityId: number;
  entityName: string;
  deepLinkPath: string;
  payload?: Record<string, unknown>;
  urgencyOverride?: "immediate" | "routine";
}
