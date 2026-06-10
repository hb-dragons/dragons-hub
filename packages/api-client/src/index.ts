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
} from "./endpoints";
