import type {
  ScoreboardSnapshotRow,
  ScoreboardHealth,
  PublicLiveSnapshot,
} from "@dragons/shared";
import type { ScoreboardListQuery } from "@dragons/contracts";
import type { ApiClient } from "../client";

export function scoreboardEndpoints(client: ApiClient) {
  return {
    snapshots(
      query: Partial<ScoreboardListQuery> & Pick<ScoreboardListQuery, "deviceId">,
    ): Promise<ScoreboardSnapshotRow[]> {
      return client.get(
        "/admin/scoreboard/snapshots",
        query as Record<string, string | number | boolean | undefined>,
      );
    },
    health(deviceId: string): Promise<ScoreboardHealth> {
      return client.get("/admin/scoreboard/health", { deviceId });
    },
    latest(deviceId: string): Promise<PublicLiveSnapshot> {
      return client.get("/public/scoreboard/latest", { deviceId });
    },
  };
}
