import type { TestPushResponse } from "@dragons/shared";
import type { NotificationTestSendBody } from "@dragons/contracts";
import type { ApiClient } from "../client";

export interface TestPushRecentItem {
  id: number;
  sentAt: string | null;
  recipientToken: string | null;
  status: string;
  providerTicketId: string | null;
  errorMessage: string | null;
}

export interface TestPushRecentResponse {
  results: TestPushRecentItem[];
}

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
