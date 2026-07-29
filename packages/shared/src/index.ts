// Constants & enums
export {
  TASK_PRIORITIES,
  BOOKING_STATUSES,
  SYNC_STATUSES,
  ENTITY_TYPES,
  ENTRY_ACTIONS,
} from "./constants";
export type {
  TaskPriority,
  BookingStatus,
  RefereeSlotStatus,
  SyncStatus,
  EntityType,
  EntryAction,
} from "./constants";

// Validation schemas
export {
  dateSchema,
  timeSchema,
  bookingStatusSchema,
  taskPrioritySchema,
  matchFormSchema,
} from "./validation";
export type { MatchFormValues } from "./validation";

// Pagination
export type { PaginatedResponse } from "./pagination";

// Domain types
export type {
  FieldDiff,
  OverrideInfo,
  MatchListItem,
  MatchDetail,
  MatchDetailResponse,
  MatchFieldChange,
  MatchChangesResponse,
  MatchChangeHistoryItem,
  MatchChangeHistoryResponse,
  RefereeSlotInfo,
} from "./matches";

export type { OwnClubTeam, TeamReorderItem } from "./teams";

export type {
  BookingListItem,
  BookingDetail,
  ReconcilePreview,
  ReconcilePreviewCreate,
  ReconcilePreviewUpdate,
  ReconcilePreviewRemove,
  ReconcilePreviewMatch,
  ReconcileResult,
} from "./bookings";

export type {
  TaskAssignee,
  TaskCardData,
  ChecklistItem,
  TaskComment,
  TaskDetail,
} from "./tasks";

export type { BoardColumnData, BoardSummary, BoardData } from "./boards";

// Board DnD (drag-and-drop)
export {
  computeDropTarget,
  buildColumnReorder,
  applyTaskMove,
  applyColumnReorder,
} from "./board-dnd";

// Board filter persistence (pure, native side wraps with expo-secure-store)
export { serializeFilters, parseFilters } from "./board-filter-storage";
export type { SerialisableBoardFilters } from "./board-filter-storage";

// Board task sort (pure comparator factory)
export { boardTaskComparator } from "./board-task-sort";
export type { BoardSortMode } from "./board-task-sort";

// Board due-date bucketing (pure helper for native task card colouring)
export { dueDateBucket } from "./board-due-date";
export type { DueDateBucket } from "./board-due-date";

// Board drop-target resolution (pure, testable, no React deps)
export { findDropTarget } from "./board-drop-target";
export type {
  TaskContentRect,
  PagerLayout,
  ColumnScrollState,
} from "./board-drop-target";

export type {
  SyncRunSummary,
  SyncRun,
  SyncRunEntry,
  SyncStatusResponse,
  SyncRunEntriesResponse,
  SyncScheduleData,
  TriggerResponse,
  LiveLogEntry,
} from "./sync";

export type {
  RefereeGameListItem,
} from "./referee-games";
export type {
  RefereeListItem,
  RefereeRule,
  RefereeRulesResponse,
  RefereeCountsResponse,
  EligibleOpenGamesResponse,
} from "./referees";
export type { StandingItem, LeagueStandings } from "./standings";
export type { VenueListItem, VenueSearchResult } from "./venues";
export type { UserListItem } from "./users";
export type {
  NotificationItem,
  NotificationListResult,
  NotificationActionResponse,
  NotificationMarkAllReadResponse,
  NotificationPreferences,
  FailedNotificationItem,
  FailedNotificationListResult,
  TestPushResponse,
  TestPushRecentResponse,
} from "./notifications";
export type {
  SocialMatchItem,
  SocialPlayerPhoto,
  SocialBackground,
  SocialActionResponse,
} from "./social";
export { USER_TOGGLEABLE_EVENTS, isUserToggleableEventType } from "./notification-events";
export type {
  ClubConfig,
  BookingSettings,
  RefereeReminderConfig,
  RefereeGamesSyncResponse,
  LeagueOwnClubRefsResponse,
} from "./settings";
export { BOOKING_DEFAULTS } from "./settings";
export type {
  ResolvedLeague,
  ResolveResult,
  TrackedLeaguesResponse,
} from "./leagues";

// Domain events
export * from "./domain-events";
export { validateEventPayload } from "./domain-event-schemas";
export type { EventPayload, RefereeSlotsPayload } from "./domain-event-schemas";

// Watch rules
export * from "./watch-rules";

// Channel configs
export * from "./channel-configs";

// Team colors
export { COLOR_PRESET_KEYS, getColorPreset } from "./team-colors";

// Native team colors
export { getNativeTeamColor } from "./native-team-colors";

// Match context & dashboard types
export type {
  PreviousMeeting,
  HeadToHead,
  FormEntry,
  MatchContext,
  TeamStats,
  ClubStats,
  HomeDashboard,
  PublicMatchDetail,
} from "./match-context";

// Referee assignment
export type {
  AssignRefereeResponse,
  UnassignRefereeResponse,
  CandidateSearchResponse,
} from "./referee-assignment";

// Brand utilities
export { clubLogoUrl } from "./brand";

// RBAC — role/permission definitions and helpers
export {
  ac,
  roles,
  ROLE_NAMES,
  parseRoles,
  can,
  satisfiesRole,
  isReferee,
  canViewOpenGames,
} from "./rbac";
export type { RoleName, Resource, Action, GateUser } from "./rbac";

// Navigation surfaces, tabs, and Today ordering (role-aware shell foundation)
export * from "./nav-surfaces";
export * from "./nav-tabs";
export * from "./today";

export * from "./referee-history";

// Kickoff "today" resolution + formatting (timezone-explicit; shared by web + native)
export * from "./kickoff";

// Notification events
export * from "./notification-events";

// Scoreboard types
export type {
  StramatelSnapshot,
  PublicLiveSnapshot,
  ScoreboardSnapshotRow,
  ScoreboardHealth,
} from "./scoreboard";

// Broadcast types
export type {
  BroadcastPhase,
  BroadcastMatchTeam,
  BroadcastMatch,
  BroadcastState,
  BroadcastConfig,
  AdminBroadcastMatchListItem,
} from "./broadcast";
