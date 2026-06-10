export { ApiClient } from "./client";
export type { AuthStrategy, ApiClientOptions } from "./client";

export { APIError } from "./errors";

export { createApi } from "./create-api";
export type { Api } from "./create-api";

export { buildQueryString } from "./query-string";

export {
  publicEndpoints,
  deviceEndpoints,
  refereeEndpoints,
  adminBoardEndpoints,
  matchEndpoints,
  syncEndpoints,
  notificationEndpoints,
  socialEndpoints,
  settingsEndpoints,
  bookingEndpoints,
} from "./endpoints";
export type {
  MatchQueryParams,
  PublicTeam,
  RegisterDeviceResponse,
  UnregisterDeviceResponse,
  RefereeGamesQueryParams,
  TaskCreateBody,
  TaskUpdateBody,
  TaskMoveBody,
  TaskListQuery,
  BoardCreateBody,
  BoardUpdateBody,
  ColumnCreateBody,
  ColumnUpdateBody,
  MatchListQuery,
  MatchUpdateBody,
  MatchHistoryQuery,
  SyncLogsQuery,
  SyncEntriesQuery,
  SyncUpdateScheduleBody,
  NotificationListQuery,
  NotificationPreferencesBody,
  SocialMatchesQuery,
  SocialGenerateBody,
  SettingsClubConfig,
  SettingsBookingConfig,
  SettingsRefereeReminder,
  LeagueNumbersBody,
  LeagueOwnClubRefsBody,
  BookingListQuery,
  BookingCreateBody,
  BookingUpdateBody,
  BookingStatusBody,
} from "./endpoints";
