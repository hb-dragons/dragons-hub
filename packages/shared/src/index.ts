// Constants & enums
export {
  TASK_PRIORITIES,
  BOOKING_STATUSES,
  SYNC_STATUSES,
  ENTITY_TYPES,
  ENTRY_ACTIONS,
  DIFF_STATUSES,
  DATE_REGEX,
  TIME_REGEX,
} from "./constants";
export type {
  TaskPriority,
  BookingStatus,
  SyncStatus,
  EntityType,
  EntryAction,
  DiffStatus,
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

export type {
  BookingMatch,
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
export type { DragItem, DropTarget } from "./board-dnd";

// Undo entries for destructive board operations
export { buildUndoEntry } from "./board-undo";
export type {
  UndoEntry,
  UndoableSnapshot,
  UndoableTaskSnapshot,
  UndoableChecklistSnapshot,
  UndoableCommentSnapshot,
} from "./board-undo";

// Board filter persistence (pure, native side wraps with expo-secure-store)
export { serializeFilters, parseFilters } from "./board-filter-storage";
export type { SerialisableBoardFilters } from "./board-filter-storage";

// Board task sort (pure comparator factory)
export { boardTaskComparator } from "./board-task-sort";
export type { BoardSortMode } from "./board-task-sort";

// Board drop-target resolution (pure, testable, no React deps)
export { findDropTarget } from "./board-drop-target";
export type {
  TaskContentRect,
  PagerLayout,
  ColumnScrollState,
  FindDropTargetArgs,
  FindDropTargetResult,
} from "./board-drop-target";

export type {
  SyncRunSummary,
  SyncRun,
  SyncRunEntry,
  SyncStatusResponse,
  SyncRunEntriesResponse,
  SyncJobData,
  Job,
  JobsResponse,
  SyncScheduleData,
  TriggerResponse,
  LiveLogEntry,
} from "./sync";

export type {
  RefereeGameListItem,
} from "./referee-games";
export type { RefereeListItem, RefereeRule, RefereeRulesResponse, UpdateRefereeRulesBody, UpdateRefereeVisibilityBody } from "./referees";
export type { StandingItem, LeagueStandings } from "./standings";
export type { VenueListItem, VenueSearchResult } from "./venues";
export type { UserListItem } from "./users";
export type { NotificationItem, NotificationListResult } from "./notifications";
export type { UserToggleableEventType } from "./notification-events";
export { USER_TOGGLEABLE_EVENTS, isUserToggleableEventType } from "./notification-events";
export type { ClubConfig, BookingSettings } from "./settings";
export { BOOKING_DEFAULTS } from "./settings";
export type {
  ResolvedLeague,
  ResolveResult,
  TrackedLeague,
  TrackedLeaguesResponse,
} from "./leagues";

// Domain events
export * from "./domain-events";

// Watch rules
export * from "./watch-rules";

// Channel configs
export * from "./channel-configs";

// Team colors
export { COLOR_PRESETS, COLOR_PRESET_KEYS, getColorPreset } from "./team-colors";
export type { ColorPreset, ColorPresetMode } from "./team-colors";

// Native team colors
export { getNativeTeamColor } from "./native-team-colors";
export type { NativeTeamColor } from "./native-team-colors";

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
  AssignRefereeBody,
  AssignRefereeResponse,
  UnassignRefereeResponse,
  CandidateSearchResponse,
} from "./referee-assignment";

// Brand utilities
export { clubLogoUrl } from "./brand";

// RBAC — role/permission definitions and helpers
export {
  statement,
  ac,
  roles,
  admin,
  refereeAdmin,
  venueManager,
  teamManager,
  ROLE_NAMES,
  parseRoles,
  can,
  canAll,
  hasRole,
  isReferee,
  canViewOpenGames,
} from "./rbac";
export type { RoleName, Resource, Action } from "./rbac";

export * from "./referee-history";

// Notification events
export * from "./notification-events";
