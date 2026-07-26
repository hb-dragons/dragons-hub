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

// Channel config shapes live in @dragons/shared (the API's ChannelType /
// per-channel config shapes / ChannelConfigItem+ListResult / provider
// availability); re-export so call sites keep one name.
export { CHANNEL_TYPES } from "@dragons/shared";
export type {
  ChannelType,
  InAppConfig,
  WhatsAppGroupConfig,
  PushConfig,
  ChannelConfig,
  ChannelConfigItem,
  ChannelConfigListResult,
  ProviderStatus,
  ProviderAvailability,
} from "@dragons/shared";

// Trigger event body is the request contract; re-export from the API client
// (inferred from @dragons/contracts) so call sites keep one name.
export type { TriggerEventBody } from "@dragons/api-client";
