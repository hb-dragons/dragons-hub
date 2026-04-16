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
  TaskCardData,
  ChecklistItem,
  TaskComment,
  TaskDetail,
} from "./tasks";

export type { BoardColumnData, BoardSummary, BoardData } from "./boards";

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

// Referee assignment
export type {
  AssignRefereeBody,
  AssignRefereeResponse,
  UnassignRefereeResponse,
  CandidateSearchResponse,
} from "./referee-assignment";
