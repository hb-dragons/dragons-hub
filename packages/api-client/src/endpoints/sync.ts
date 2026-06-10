import type {
  PaginatedResponse,
  SyncRun,
  SyncStatusResponse,
  SyncScheduleData,
  SyncRunEntriesResponse,
  MatchChangesResponse,
  TriggerResponse,
} from "@dragons/shared";
import type {
  SyncLogsQuery,
  SyncEntriesQuery,
  SyncUpdateScheduleBody,
} from "@dragons/contracts";
import type { ApiClient } from "../client";

export function syncEndpoints(client: ApiClient) {
  return {
    trigger(): Promise<TriggerResponse> {
      return client.post("/admin/sync/trigger");
    },
    status(syncType?: string): Promise<SyncStatusResponse> {
      return client.get("/admin/sync/status", syncType ? { syncType } : undefined);
    },
    logs(query?: Partial<SyncLogsQuery>): Promise<PaginatedResponse<SyncRun>> {
      return client.get(
        "/admin/sync/logs",
        query as Record<string, string | number | boolean | undefined>,
      );
    },
    logEntries(
      id: number,
      query?: Partial<SyncEntriesQuery>,
      opts?: { signal?: AbortSignal },
    ): Promise<SyncRunEntriesResponse> {
      return client.get(
        `/admin/sync/logs/${id}/entries`,
        query as Record<string, string | number | boolean | undefined>,
        opts,
      );
    },
    matchChanges(id: number, apiMatchId: number): Promise<MatchChangesResponse> {
      return client.get(`/admin/sync/logs/${id}/match-changes/${apiMatchId}`);
    },
    schedule(syncType?: string): Promise<SyncScheduleData> {
      return client.get("/admin/sync/schedule", syncType ? { syncType } : undefined);
    },
    updateSchedule(body: SyncUpdateScheduleBody): Promise<SyncScheduleData> {
      return client.put("/admin/sync/schedule", body);
    },
  };
}
