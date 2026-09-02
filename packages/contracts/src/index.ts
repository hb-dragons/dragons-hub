export { idParamSchema, type IdParam } from "./common";

export {
  boardIdParamSchema,
  boardCreateBodySchema,
  boardUpdateBodySchema,
  columnIdParamSchema,
  columnCreateBodySchema,
  columnUpdateBodySchema,
  columnReorderBodySchema,
  type BoardCreateBody,
  type BoardUpdateBody,
  type ColumnCreateBody,
  type ColumnUpdateBody,
  type ColumnReorderBody,
} from "./board";

export {
  matchListQuerySchema,
  publicMatchListQuerySchema,
  matchIdParamSchema,
  publicMatchIdParamSchema,
  matchUpdateBodySchema,
  matchHistoryQuerySchema,
  releaseOverrideParamsSchema,
  type MatchListQuery,
  type PublicMatchListQuery,
  type MatchUpdateBody,
  type MatchIdParam,
  type MatchHistoryQuery,
  type ReleaseOverrideParams,
} from "./match";

export {
  bookingIdParamSchema,
  bookingListQuerySchema,
  bookingUpdateBodySchema,
  bookingStatusBodySchema,
  bookingCreateBodySchema,
  type BookingListQuery,
  type BookingCreateBody,
  type BookingUpdateBody,
  type BookingStatusBody,
} from "./booking";

export {
  channelConfigIdParamSchema,
  channelConfigListQuerySchema,
  createChannelConfigSchema,
  updateChannelConfigSchema,
  validateConfigForType,
  type ChannelConfigIdParam,
  type ChannelConfigListQuery,
  type ChannelConfigCreateBody,
  type ChannelConfigCreateBodyParsed,
  type ChannelConfigUpdateBody,
  type ChannelConfigUpdateBodyParsed,
} from "./channel-config";

export {
  eventListQuerySchema,
  triggerEventSchema,
  type EventListQuery,
  type TriggerEventBody,
} from "./event";

export {
  notificationIdParamSchema,
  notificationListQuerySchema,
  notificationPreferencesBodySchema,
  type NotificationListQuery,
  type NotificationPreferencesBody,
} from "./notification";

export {
  refereeHistoryFilterSchema,
  refereeHistoryGamesQuerySchema,
  type RefereeHistoryFilterQuery,
  type RefereeHistoryGamesQuery,
} from "./referee-history";

export {
  refereeRulesParamSchema,
  updateRefereeRulesBodySchema,
  type RefereeRulesParam,
  type UpdateRefereeRulesBodyParsed,
} from "./referee-rules";

export {
  refereeListQuerySchema,
  refereeVisibilityBodySchema,
  refereeApiMatchParamSchema,
  refereeMatchIdParamSchema,
  refereeGameIdParamSchema,
  refereeIdParamSchema,
  type RefereeListQuery,
  type RefereeVisibilityBody,
  type RefereeApiMatchParam,
  type RefereeMatchIdParam,
  type RefereeGameIdParam,
  type RefereeIdParam,
} from "./referee";

export {
  spielplanIdParamSchema,
  refAssignmentCandidatesQuerySchema,
  assignmentSlotParamSchema,
  type SpielplanIdParam,
  type RefAssignmentCandidatesQuery,
  type AssignmentSlotParam,
} from "./referee-assignment";

export {
  socialMatchesQuerySchema,
  socialGenerateBodySchema,
  socialIdParamSchema,
  type SocialMatchesQuery,
  type SocialGenerateBody,
} from "./social";

export {
  syncLogsQuerySchema,
  syncEntryIdParamSchema,
  syncEntriesQuerySchema,
  syncStreamParamSchema,
  syncJobStatusesQuerySchema,
  syncJobIdParamSchema,
  syncTypeQuerySchema,
  syncUpdateScheduleBodySchema,
  syncMatchChangesParamSchema,
  SYNC_JOB_STATUSES,
  type SyncLogsQuery,
  type SyncEntriesQuery,
  type SyncUpdateScheduleBody,
} from "./sync";

export {
  teamIdParamSchema,
  teamUpdateBodySchema,
  teamReorderBodySchema,
  teamsListQuerySchema,
  type TeamUpdateBody,
  type TeamReorderBody,
  type TeamsListQuery,
} from "./team";

export {
  teamStaffParamSchema,
  teamStaffCreateBodySchema,
  teamStaffUpdateBodySchema,
  type TeamStaffCreateBody,
  type TeamStaffUpdateBody,
} from "./team-staff";

export {
  venueSearchQuerySchema,
  type VenueSearchQuery,
} from "./venue";

export {
  taskBoardIdParamSchema,
  taskIdParamSchema,
  taskChecklistItemParamSchema,
  taskCommentParamSchema,
  taskListQuerySchema,
  taskCreateBodySchema,
  taskUpdateBodySchema,
  taskAssigneeParamSchema,
  taskMoveBodySchema,
  checklistItemCreateBodySchema,
  checklistItemUpdateBodySchema,
  commentCreateBodySchema,
  commentUpdateBodySchema,
  type TaskAssigneeParam,
  type TaskListQuery,
  type TaskCreateBody,
  type TaskUpdateBody,
  type TaskMoveBody,
  type ChecklistItemCreateBody,
  type ChecklistItemUpdateBody,
  type CommentCreateBody,
  type CommentUpdateBody,
} from "./task";

export {
  watchRuleIdParamSchema,
  watchRuleListQuerySchema,
  createWatchRuleSchema,
  updateWatchRuleSchema,
  type WatchRuleIdParam,
  type WatchRuleListQuery,
  type WatchRuleCreateBody,
  type WatchRuleUpdateBody,
} from "./watch-rule";

export {
  publicTeamIdParamSchema,
  publicScheduleIcsQuerySchema,
  type PublicScheduleIcsQuery,
} from "./public";

export {
  refereeGamesQuerySchema,
  refereeAssignBodySchema,
  refereeClaimBodySchema,
  refereeAssignParamSchema,
  refereeClaimParamSchema,
  type RefereeGamesQuery,
  type RefereeAssignBody,
  type RefereeClaimBody,
  type RefereeAssignParam,
  type RefereeClaimParam,
} from "./referee-self";

export {
  deviceRegisterBodySchema,
  deviceTokenParamSchema,
  type DeviceRegisterBody,
  type DeviceTokenParam,
} from "./devices";

export {
  leagueOwnClubRefsSchema,
  leagueIdParamSchema,
  ligaIdParamSchema,
  type LeagueOwnClubRefsBody,
  type LeagueIdParam,
  type LigaIdParam,
} from "./league";

export {
  standingsListQuerySchema,
  type StandingsListQuery,
} from "./standings";

export {
  scoreboardListQuerySchema,
  scoreboardLastEventIdSchema,
  scoreboardDeviceQuerySchema,
  type ScoreboardListQuery,
  type ScoreboardLastEventId,
  type ScoreboardDeviceQuery,
} from "./scoreboard";

export {
  createSeasonSchema,
  seasonIdParamSchema,
  browseLeaguesQuerySchema,
  seasonLeaguesSchema,
  type CreateSeasonBody,
  type SeasonIdParam,
  type BrowseLeaguesQuery,
  type SeasonLeaguesBody,
} from "./season";

export {
  settingsClubConfigSchema,
  settingsBookingConfigSchema,
  settingsRefereeReminderSchema,
  type SettingsClubConfig,
  type SettingsBookingConfig,
  type SettingsRefereeReminder,
} from "./settings";

export {
  userRefereeLinkBodySchema,
  type UserRefereeLinkBody,
  userIdParamSchema,
  type UserIdParam,
} from "./user";

export {
  broadcastUpsertSchema,
  broadcastStartStopSchema,
  broadcastMatchesQuerySchema,
  type BroadcastUpsertBody,
  type BroadcastStartStopBody,
  type BroadcastMatchesQuery,
} from "./broadcast";

export {
  notificationTestSendBodySchema,
  type NotificationTestSendBody,
} from "./notification-test";

export { qaChatBodySchema, type QaChatBody } from "./qa";

export {
  assistantRescheduleChatBodySchema,
  type AssistantRescheduleChatBody,
} from "./assistant";

export {
  unsubscribeQuerySchema,
  type UnsubscribeQuery,
} from "./unsubscribe";

export {
  probetrainingRequestSchema,
  type ProbetrainingRequest,
} from "./probetraining";
