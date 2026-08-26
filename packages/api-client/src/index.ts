export { ApiClient } from "./client";

export { APIError } from "./errors";

export { createApi } from "./create-api";
export type { Api } from "./create-api";

export {
  publicEndpoints,
  deviceEndpoints,
  refereeEndpoints,
  adminBoardEndpoints,
} from "./endpoints";
export type {
  MatchQueryParams,
  PublicTeam,
  RefereeGamesQueryParams,
  TaskCreateBody,
  TaskUpdateBody,
  TaskListQuery,
  BoardCreateBody,
  BoardUpdateBody,
  ColumnCreateBody,
  ColumnUpdateBody,
  MatchUpdateBody,
  SyncEntriesQuery,
  TriggerEventBody,
  BroadcastUpsertBody,
} from "./endpoints";
