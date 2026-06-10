import { describe, it, expect, vi } from "vitest";
import {
  syncLogsQuerySchema,
  syncEntriesQuerySchema,
  syncUpdateScheduleBodySchema,
} from "@dragons/contracts";
import { ApiClient } from "../client";
import { syncEndpoints } from "./sync";

/** Build a client whose fetch records the outgoing request body + signal. */
function recordingClient() {
  const calls: { url: string; body: unknown; signal: AbortSignal | null }[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url: String(url), body, signal: init?.signal ?? null });
    return new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const client = new ApiClient({
    baseUrl: "https://example.test",
    fetchFn: fetchFn as unknown as typeof fetch,
  });
  return { api: syncEndpoints(client), calls };
}

describe("sync request bodies satisfy @dragons/contracts schemas", () => {
  it("logs query parses against syncLogsQuerySchema", async () => {
    const { api, calls } = recordingClient();
    await api.logs({ limit: 20, offset: 0, syncType: "referee-games" });
    const query = Object.fromEntries(new URL(calls[0]!.url).searchParams);
    const parsed = syncLogsQuerySchema.safeParse(query);
    expect(parsed.error?.issues, "syncLogsQuerySchema rejected the logs query").toBeUndefined();
  });

  it("logEntries query parses against syncEntriesQuerySchema", async () => {
    const { api, calls } = recordingClient();
    await api.logEntries(7, {
      limit: 50,
      offset: 0,
      entityType: "match",
      action: "updated",
      search: "Dragons",
    });
    const query = Object.fromEntries(new URL(calls[0]!.url).searchParams);
    const parsed = syncEntriesQuerySchema.safeParse(query);
    expect(parsed.error?.issues, "syncEntriesQuerySchema rejected the entries query").toBeUndefined();
  });

  it("logEntries threads an AbortSignal into the request", async () => {
    const { api, calls } = recordingClient();
    const controller = new AbortController();
    await api.logEntries(7, { limit: 50, offset: 0 }, { signal: controller.signal });
    expect(calls[0]!.signal).toBe(controller.signal);
  });

  it("updateSchedule (cron variant) body parses against syncUpdateScheduleBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.updateSchedule({
      enabled: true,
      cronExpression: "0 4 * * *",
      timezone: "Europe/Berlin",
    });
    const parsed = syncUpdateScheduleBodySchema.safeParse(calls[0]!.body);
    expect(parsed.error?.issues, "syncUpdateScheduleBodySchema rejected the cron body").toBeUndefined();
  });

  it("updateSchedule (interval variant) body parses against syncUpdateScheduleBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.updateSchedule({
      syncType: "referee-games",
      enabled: false,
      intervalMinutes: 30,
    });
    const parsed = syncUpdateScheduleBodySchema.safeParse(calls[0]!.body);
    expect(parsed.error?.issues, "syncUpdateScheduleBodySchema rejected the interval body").toBeUndefined();
  });

  it("matchChanges builds the nested path", async () => {
    const { api, calls } = recordingClient();
    await api.matchChanges(12, 9988);
    expect(calls[0]!.url).toContain("/admin/sync/logs/12/match-changes/9988");
  });

  it("trigger POSTs to /admin/sync/trigger", async () => {
    const { api, calls } = recordingClient();
    await api.trigger();
    expect(calls[0]!.url).toContain("/admin/sync/trigger");
  });

  it("status passes syncType as a query param when provided", async () => {
    const { api, calls } = recordingClient();
    await api.status("referee-games");
    const query = Object.fromEntries(new URL(calls[0]!.url).searchParams);
    expect(query.syncType).toBe("referee-games");
  });

  it("status omits the query string when no syncType is given", async () => {
    const { api, calls } = recordingClient();
    await api.status();
    expect(calls[0]!.url).not.toContain("?");
  });

  it("schedule passes syncType as a query param when provided", async () => {
    const { api, calls } = recordingClient();
    await api.schedule("referee-games");
    const query = Object.fromEntries(new URL(calls[0]!.url).searchParams);
    expect(query.syncType).toBe("referee-games");
  });

  it("schedule omits the query string when no syncType is given", async () => {
    const { api, calls } = recordingClient();
    await api.schedule();
    expect(calls[0]!.url).not.toContain("?");
  });
});
