import type {
  DomainEventListResult,
  FailedNotificationListResult,
  TriggerEventResult,
} from "@dragons/shared";
import type { EventListQuery, TriggerEventBody } from "@dragons/contracts";
import type { ApiClient } from "../client";

export function eventEndpoints(client: ApiClient) {
  return {
    list(query?: Partial<EventListQuery>): Promise<DomainEventListResult> {
      return client.get(
        "/admin/events",
        query as Record<string, string | number | boolean | undefined>,
      );
    },
    failed(
      query?: Partial<EventListQuery>,
    ): Promise<FailedNotificationListResult> {
      return client.get(
        "/admin/events/failed",
        query as Record<string, string | number | boolean | undefined>,
      );
    },
    trigger(body: TriggerEventBody): Promise<TriggerEventResult> {
      return client.post("/admin/events/trigger", body);
    },
  };
}
