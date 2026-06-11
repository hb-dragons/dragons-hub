export { publicEndpoints } from "./public";
export type { MatchQueryParams, PublicTeam } from "./public";

export { deviceEndpoints } from "./devices";
export type { RegisterDeviceResponse, UnregisterDeviceResponse } from "./devices";

export { refereeEndpoints } from "./referee";
export type { RefereeGamesQueryParams } from "./referee";

export { refereeAdminEndpoints } from "./referee-admin";
export type {
  RefereeListQuery,
  RefereeVisibilityBody,
  UpdateRefereeRulesBodyParsed,
  RefereeHistoryFilterQuery,
  RefereeHistoryGamesQuery,
} from "@dragons/contracts";

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

export { notificationTestEndpoints } from "./notification-test";
export type { NotificationTestSendBody } from "@dragons/contracts";

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

export { eventEndpoints } from "./event";
export type { EventListQuery, TriggerEventBody } from "@dragons/contracts";

export { venueEndpoints } from "./venue";
export type { VenueSearchQuery } from "@dragons/contracts";

export { scoreboardEndpoints } from "./scoreboard";
export type { ScoreboardListQuery } from "@dragons/contracts";

export { standingsEndpoints } from "./standings";

export { userEndpoints } from "./user";
export type { UserRefereeLinkResult } from "./user";
export type { UserRefereeLinkBody } from "@dragons/contracts";
