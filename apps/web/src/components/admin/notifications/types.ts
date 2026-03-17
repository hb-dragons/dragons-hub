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

// Notification from GET /admin/notifications
export interface NotificationItem {
  id: number;
  eventId: string;
  watchRuleId: number | null;
  channelConfigId: number;
  recipientId: string | null;
  title: string;
  body: string;
  locale: string;
  status: string;
  sentAt: string | null;
  readAt: string | null;
  digestRunId: number | null;
  errorMessage: string | null;
  retryCount: number;
  createdAt: string;
  eventType: string;
  entityName: string;
  entityType: string;
  entityId: number;
  deepLinkPath: string;
  urgency: string;
}

export interface NotificationListResult {
  notifications: NotificationItem[];
  total: number;
}

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

// Watch rule from GET /admin/watch-rules
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

export interface FilterCondition {
  field: "teamId" | "leagueId" | "venueId" | "source";
  operator: "eq" | "neq" | "in" | "any";
  value: string | string[] | null;
}

export interface ChannelTarget {
  channel: "in_app" | "whatsapp_group" | "push" | "email";
  targetId: string;
}

export interface WatchRuleListResult {
  rules: WatchRuleItem[];
  total: number;
}

// Channel config from GET /admin/channel-configs
export interface ChannelConfigItem {
  id: number;
  name: string;
  type: "in_app" | "whatsapp_group" | "push" | "email";
  enabled: boolean;
  config: Record<string, unknown>;
  digestMode: "per_sync" | "scheduled" | "none";
  digestCron: string | null;
  digestTimezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChannelConfigListResult {
  channels: ChannelConfigItem[];
  total: number;
}

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
