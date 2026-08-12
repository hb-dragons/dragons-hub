export { publicEndpoints } from "./public";
export type { MatchQueryParams, PublicTeam } from "./public";

export { deviceEndpoints } from "./devices";

export { refereeEndpoints } from "./referee";
export type { RefereeGamesQueryParams } from "./referee";

export { refereeAdminEndpoints } from "./referee-admin";

export { adminBoardEndpoints } from "./admin-board";
export type {
  BoardCreateBody,
  BoardUpdateBody,
  ColumnCreateBody,
  ColumnUpdateBody,
  TaskCreateBody,
  TaskUpdateBody,
  TaskListQuery,
} from "@dragons/contracts";

export { matchEndpoints } from "./match";
export type { MatchUpdateBody } from "@dragons/contracts";

export { syncEndpoints } from "./sync";
export type { SyncEntriesQuery } from "@dragons/contracts";

export { notificationEndpoints } from "./notification";

export { notificationTestEndpoints } from "./notification-test";

export { socialEndpoints } from "./social";

export { settingsEndpoints } from "./settings";

export { bookingEndpoints } from "./booking";

export { teamEndpoints } from "./team";

export { channelConfigEndpoints } from "./channel-config";

export { broadcastEndpoints } from "./broadcast";
export type { BroadcastUpsertBody } from "@dragons/contracts";

export { watchRuleEndpoints } from "./watch-rule";

export { eventEndpoints } from "./event";
export type { TriggerEventBody } from "@dragons/contracts";

export { venueEndpoints } from "./venue";

export { scoreboardEndpoints } from "./scoreboard";

export { standingsEndpoints } from "./standings";

export { userEndpoints } from "./user";

export { seasonsEndpoints } from "./seasons";
