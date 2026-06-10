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
