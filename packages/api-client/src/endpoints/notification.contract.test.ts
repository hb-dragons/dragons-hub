import { describe, it, expect, vi } from "vitest";
import {
  notificationListQuerySchema,
  notificationPreferencesBodySchema,
} from "@dragons/contracts";
import { ApiClient } from "../client";
import { notificationEndpoints } from "./notification";

/** Build a client whose fetch records the outgoing request method, url, and body. */
function recordingClient() {
  const calls: { method: string; url: string; body: unknown }[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method: init?.method ?? "GET", url: String(url), body });
    return new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const client = new ApiClient({
    baseUrl: "https://example.test",
    fetchFn: fetchFn as unknown as typeof fetch,
  });
  return { api: notificationEndpoints(client), calls };
}

describe("notification request bodies satisfy @dragons/contracts schemas", () => {
  it("list query parses against notificationListQuerySchema", async () => {
    const { api, calls } = recordingClient();
    await api.list({ limit: 20, offset: 0, userId: "user-1" });
    const query = Object.fromEntries(new URL(calls[0]!.url).searchParams);
    const parsed = notificationListQuerySchema.safeParse(query);
    expect(
      parsed.error?.issues,
      "notificationListQuerySchema rejected the list query",
    ).toBeUndefined();
  });

  it("updatePreferences body parses against notificationPreferencesBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.updatePreferences({
      mutedEventTypes: ["match.scheduled"],
      locale: "en",
    });
    const parsed = notificationPreferencesBodySchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "notificationPreferencesBodySchema rejected the preferences body",
    ).toBeUndefined();
  });

  it("markRead PATCHes the /read path", async () => {
    const { api, calls } = recordingClient();
    await api.markRead(42);
    expect(calls[0]!.method).toBe("PATCH");
    expect(calls[0]!.url).toContain("/admin/notifications/42/read");
  });

  it("markAllRead PATCHes /admin/notifications/read-all", async () => {
    const { api, calls } = recordingClient();
    await api.markAllRead();
    expect(calls[0]!.method).toBe("PATCH");
    expect(calls[0]!.url).toContain("/admin/notifications/read-all");
  });

  it("retry POSTs the /retry path", async () => {
    const { api, calls } = recordingClient();
    await api.retry(7);
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toContain("/admin/notifications/7/retry");
  });

  it("getPreferences GETs /admin/notifications/preferences", async () => {
    const { api, calls } = recordingClient();
    await api.getPreferences();
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url).toContain("/admin/notifications/preferences");
  });

  it("list omits the query string when no filters are given", async () => {
    const { api, calls } = recordingClient();
    await api.list();
    expect(calls[0]!.url).not.toContain("?");
  });
});
