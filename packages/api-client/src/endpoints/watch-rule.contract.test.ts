import { describe, it, expect, vi } from "vitest";
import {
  watchRuleListQuerySchema,
  createWatchRuleSchema,
  updateWatchRuleSchema,
} from "@dragons/contracts";
import { ApiClient } from "../client";
import { watchRuleEndpoints } from "./watch-rule";

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
  return { api: watchRuleEndpoints(client), calls };
}

describe("watch-rule request bodies/queries satisfy @dragons/contracts schemas", () => {
  it("list query parses against watchRuleListQuerySchema", async () => {
    const { api, calls } = recordingClient();
    await api.list({ page: 2, limit: 50 });
    const url = new URL(calls[0]!.url);
    const parsed = watchRuleListQuerySchema.safeParse(
      Object.fromEntries(url.searchParams),
    );
    expect(
      parsed.error?.issues,
      "watchRuleListQuerySchema rejected the list query",
    ).toBeUndefined();
    expect(url.pathname).toBe("/admin/watch-rules");
    expect(calls[0]!.method).toBe("GET");
  });

  it("create body parses against createWatchRuleSchema", async () => {
    const { api, calls } = recordingClient();
    await api.create({
      name: "Score changes",
      eventTypes: ["match.score.changed"],
      filters: [{ field: "teamId", operator: "eq", value: "42" }],
      channels: [{ channel: "in_app", targetId: "7" }],
      urgencyOverride: null,
    });
    const parsed = createWatchRuleSchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "createWatchRuleSchema rejected the create body",
    ).toBeUndefined();
    expect(new URL(calls[0]!.url).pathname).toBe("/admin/watch-rules");
    expect(calls[0]!.method).toBe("POST");
  });

  it("update body parses against updateWatchRuleSchema", async () => {
    const { api, calls } = recordingClient();
    await api.update(7, { enabled: false });
    const parsed = updateWatchRuleSchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "updateWatchRuleSchema rejected the update body",
    ).toBeUndefined();
    expect(new URL(calls[0]!.url).pathname).toBe("/admin/watch-rules/7");
    expect(calls[0]!.method).toBe("PATCH");
  });
});

describe("watch-rule read + delete endpoints target the right path + verb", () => {
  it("get targets a single rule by id with GET", async () => {
    const { api, calls } = recordingClient();
    await api.get(3);
    expect(new URL(calls[0]!.url).pathname).toBe("/admin/watch-rules/3");
    expect(calls[0]!.method).toBe("GET");
  });

  it("remove deletes a rule by id with DELETE", async () => {
    const { api, calls } = recordingClient();
    await api.remove(9);
    expect(new URL(calls[0]!.url).pathname).toBe("/admin/watch-rules/9");
    expect(calls[0]!.method).toBe("DELETE");
  });
});
