export { publicEndpoints } from "./public";
export type { MatchQueryParams, PublicTeam } from "./public";

export { deviceEndpoints } from "./devices";
export type { RegisterDeviceResponse, UnregisterDeviceResponse } from "./devices";

export { refereeEndpoints } from "./referee";
export type { RefereeGamesQueryParams } from "./referee";

export { adminBoardEndpoints } from "./admin-board";
export type {
  TaskListFilters,
  CreateTaskBody,
  UpdateTaskBody,
  MoveTaskBody,
} from "./admin-board";
export type {
  BoardCreateBody,
  BoardUpdateBody,
  ColumnCreateBody,
  ColumnUpdateBody,
} from "@dragons/contracts";
