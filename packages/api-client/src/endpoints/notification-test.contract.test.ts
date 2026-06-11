import { describe, it, expect, vi } from "vitest";
import { notificationTestSendBodySchema } from "@dragons/contracts";
import { ApiClient } from "../client";
import { notificationTestEndpoints } from "./notification-test";

/** Build a client whose fetch records the outgoing request url + method + body. */
function recordingClient() {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url: String(url), method: init?.method ?? "GET", body });
    return new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const client = new ApiClient({
    baseUrl: "https://example.test",
    fetchFn: fetchFn as unknown as typeof fetch,
  });
  return { api: notificationTestEndpoints(client), calls };
}

describe("notification-test request bodies satisfy @dragons/contracts schemas", () => {
  it("sendTestPush (with message) body parses against notificationTestSendBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.sendTestPush({ message: "Hello from QA" });
    const url = new URL(calls[0]!.url);
    const parsed = notificationTestSendBodySchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "notificationTestSendBodySchema rejected the body",
    ).toBeUndefined();
    expect(url.pathname).toBe("/admin/notifications/test-push");
    expect(calls[0]!.method).toBe("POST");
  });

  it("sendTestPush (empty body) parses against notificationTestSendBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.sendTestPush({});
    const parsed = notificationTestSendBodySchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "notificationTestSendBodySchema rejected the empty body",
    ).toBeUndefined();
  });
});
