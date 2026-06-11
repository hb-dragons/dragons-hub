import type { WatchRuleItem, WatchRuleListResult } from "@dragons/shared";
import type {
  WatchRuleListQuery,
  WatchRuleCreateBody,
  WatchRuleUpdateBody,
} from "@dragons/contracts";
import type { ApiClient } from "../client";

export function watchRuleEndpoints(client: ApiClient) {
  return {
    list(query?: Partial<WatchRuleListQuery>): Promise<WatchRuleListResult> {
      return client.get(
        "/admin/watch-rules",
        query as Record<string, string | number | boolean | undefined>,
      );
    },
    get(id: number): Promise<WatchRuleItem> {
      return client.get(`/admin/watch-rules/${id}`);
    },
    create(body: WatchRuleCreateBody): Promise<WatchRuleItem> {
      return client.post("/admin/watch-rules", body);
    },
    update(id: number, body: WatchRuleUpdateBody): Promise<WatchRuleItem> {
      return client.patch(`/admin/watch-rules/${id}`, body);
    },
    remove(id: number): Promise<{ success: true }> {
      return client.delete(`/admin/watch-rules/${id}`);
    },
  };
}
