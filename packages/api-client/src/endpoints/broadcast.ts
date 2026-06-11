import type {
  BroadcastConfig,
  BroadcastMatch,
  BroadcastState,
  AdminBroadcastMatchListItem,
} from "@dragons/shared";
import type {
  BroadcastUpsertBody,
  BroadcastStartStopBody,
  BroadcastMatchesQuery,
} from "@dragons/contracts";
import type { ApiClient } from "../client";

interface BroadcastConfigResponse {
  config: BroadcastConfig | null;
  match: BroadcastMatch | null;
}

interface BroadcastConfigOnlyResponse {
  config: BroadcastConfig;
}

interface BroadcastMatchesResponse {
  matches: AdminBroadcastMatchListItem[];
}

export function broadcastEndpoints(client: ApiClient) {
  return {
    config(deviceId: string): Promise<BroadcastConfigResponse> {
      return client.get("/admin/broadcast/config", { deviceId });
    },
    upsertConfig(body: BroadcastUpsertBody): Promise<BroadcastConfigOnlyResponse> {
      return client.put("/admin/broadcast/config", body);
    },
    start(body: BroadcastStartStopBody): Promise<BroadcastConfigOnlyResponse> {
      return client.post("/admin/broadcast/start", body);
    },
    stop(body: BroadcastStartStopBody): Promise<BroadcastConfigOnlyResponse> {
      return client.post("/admin/broadcast/stop", body);
    },
    matches(query?: Partial<BroadcastMatchesQuery>): Promise<BroadcastMatchesResponse> {
      return client.get(
        "/admin/broadcast/matches",
        query as Record<string, string | number | boolean | undefined>,
      );
    },
    state(deviceId: string): Promise<BroadcastState> {
      return client.get("/public/broadcast/state", { deviceId });
    },
  };
}
