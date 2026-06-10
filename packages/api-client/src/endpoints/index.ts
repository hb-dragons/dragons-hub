export { publicEndpoints } from "./public";
export type { MatchQueryParams, PublicTeam } from "./public";

export { deviceEndpoints } from "./devices";
export type { RegisterDeviceResponse, UnregisterDeviceResponse } from "./devices";

export { refereeEndpoints } from "./referee";
export type { RefereeGamesQueryParams } from "./referee";

export { adminBoardEndpoints } from "./admin-board";
export type {
  BoardCreateBody,
  BoardUpdateBody,
  ColumnCreateBody,
  ColumnUpdateBody,
  TaskCreateBody,
  TaskUpdateBody,
  TaskMoveBody,
  TaskListQuery,
} from "@dragons/contracts";

export { matchEndpoints } from "./match";
export type {
  MatchListQuery,
  MatchUpdateBody,
  MatchHistoryQuery,
} from "@dragons/contracts";

export { syncEndpoints } from "./sync";
export type {
  SyncLogsQuery,
  SyncEntriesQuery,
  SyncUpdateScheduleBody,
} from "@dragons/contracts";

export { notificationEndpoints } from "./notification";
export type {
  NotificationListQuery,
  NotificationPreferencesBody,
} from "@dragons/contracts";

export { socialEndpoints } from "./social";
export type { SocialMatchesQuery, SocialGenerateBody } from "@dragons/contracts";

export { settingsEndpoints } from "./settings";
export type {
  SettingsClubConfig,
  SettingsBookingConfig,
  SettingsRefereeReminder,
  LeagueNumbersBody,
  LeagueOwnClubRefsBody,
} from "@dragons/contracts";

export { bookingEndpoints } from "./booking";
export type {
  BookingListQuery,
  BookingCreateBody,
  BookingUpdateBody,
  BookingStatusBody,
} from "@dragons/contracts";

export { teamEndpoints } from "./team";
export type { TeamUpdateBody, TeamReorderBody } from "@dragons/contracts";

export { channelConfigEndpoints } from "./channel-config";
export type {
  ChannelConfigListQuery,
  ChannelConfigCreateBody,
  ChannelConfigUpdateBody,
} from "@dragons/contracts";

export { broadcastEndpoints } from "./broadcast";
export type {
  BroadcastUpsertBody,
  BroadcastStartStopBody,
  BroadcastMatchesQuery,
} from "@dragons/contracts";

export { watchRuleEndpoints } from "./watch-rule";
export type {
  WatchRuleListQuery,
  WatchRuleCreateBody,
  WatchRuleUpdateBody,
} from "@dragons/contracts";
