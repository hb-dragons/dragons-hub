import { describe, it, expect, vi } from "vitest";
import { ApiClient } from "../client";
import { notificationTestEndpoints } from "./notification-test";

describe("notificationTestEndpoints.recentTestPush", () => {
  it("GETs /admin/notifications/test-push/recent", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = new ApiClient({
      baseUrl: "https://example.test",
      fetchFn: mockFetch as unknown as typeof fetch,
    });
    const api = notificationTestEndpoints(client);
    const result = await api.recentTestPush();
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0]![0] as string).toBe(
      "https://example.test/admin/notifications/test-push/recent",
    );
    expect(result.results).toEqual([]);
  });
});
