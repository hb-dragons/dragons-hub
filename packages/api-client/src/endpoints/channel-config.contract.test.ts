import { describe, it, expect, vi } from "vitest";
import {
  channelConfigListQuerySchema,
  createChannelConfigSchema,
  updateChannelConfigSchema,
} from "@dragons/contracts";
import { ApiClient } from "../client";
import { channelConfigEndpoints } from "./channel-config";

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
  return { api: channelConfigEndpoints(client), calls };
}

describe("channel-config request bodies/queries satisfy @dragons/contracts schemas", () => {
  it("list query parses against channelConfigListQuerySchema", async () => {
    const { api, calls } = recordingClient();
    await api.list({ page: 2, limit: 50 });
    const url = new URL(calls[0]!.url);
    const parsed = channelConfigListQuerySchema.safeParse(
      Object.fromEntries(url.searchParams),
    );
    expect(
      parsed.error?.issues,
      "channelConfigListQuerySchema rejected the list query",
    ).toBeUndefined();
    expect(url.pathname).toBe("/admin/channel-configs");
    expect(calls[0]!.method).toBe("GET");
  });

  it("create body parses against createChannelConfigSchema", async () => {
    const { api, calls } = recordingClient();
    await api.create({
      name: "Admins",
      type: "in_app",
      config: { audienceRole: "admin", locale: "de" },
      digestMode: "none",
    });
    const parsed = createChannelConfigSchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "createChannelConfigSchema rejected the create body",
    ).toBeUndefined();
    expect(calls[0]!.url).toContain("/admin/channel-configs");
    expect(calls[0]!.method).toBe("POST");
  });

  it("update body parses against updateChannelConfigSchema", async () => {
    const { api, calls } = recordingClient();
    await api.update(7, { enabled: false });
    const parsed = updateChannelConfigSchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "updateChannelConfigSchema rejected the update body",
    ).toBeUndefined();
    expect(calls[0]!.url).toContain("/admin/channel-configs/7");
    expect(calls[0]!.method).toBe("PATCH");
  });
});

describe("channel-config read + delete endpoints target the right path + verb", () => {
  it("providers targets the providers endpoint with GET", async () => {
    const { api, calls } = recordingClient();
    await api.providers();
    expect(calls[0]!.url).toContain("/admin/channel-configs/providers");
    expect(calls[0]!.method).toBe("GET");
  });

  it("get targets a single config by id with GET", async () => {
    const { api, calls } = recordingClient();
    await api.get(3);
    expect(calls[0]!.url).toContain("/admin/channel-configs/3");
    expect(calls[0]!.method).toBe("GET");
  });

  it("remove deletes a config by id with DELETE", async () => {
    const { api, calls } = recordingClient();
    await api.remove(9);
    expect(calls[0]!.url).toContain("/admin/channel-configs/9");
    expect(calls[0]!.method).toBe("DELETE");
  });
});
