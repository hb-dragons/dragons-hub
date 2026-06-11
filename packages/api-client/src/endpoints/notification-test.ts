import type { TestPushResponse, TestPushRecentResponse } from "@dragons/shared";
import type { NotificationTestSendBody } from "@dragons/contracts";
import type { ApiClient } from "../client";

export function notificationTestEndpoints(client: ApiClient) {
  return {
    sendTestPush(body: NotificationTestSendBody): Promise<TestPushResponse> {
      return client.post("/admin/notifications/test-push", body);
    },
    recentTestPush(): Promise<TestPushRecentResponse> {
      return client.get("/admin/notifications/test-push/recent");
    },
  };
}
