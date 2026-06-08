import { describe, it, expect, vi } from "vitest";
import { deviceRegisterBodySchema } from "@dragons/contracts";
import { ApiClient } from "../client";
import { deviceEndpoints } from "./devices";

/** Build a client whose fetch records the outgoing request body. */
function recordingClient() {
  const calls: { url: string; body: unknown }[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url: String(url), body });
    return new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const client = new ApiClient({
    baseUrl: "https://example.test",
    fetchFn: fetchFn as unknown as typeof fetch,
  });
  return { api: deviceEndpoints(client), calls };
}

describe("devices request bodies satisfy @dragons/contracts schemas", () => {
  it("register body parses against deviceRegisterBodySchema (with locale)", async () => {
    const { api, calls } = recordingClient();
    await api.register("fcm-abc", "ios", "de-DE");
    const parsed = deviceRegisterBodySchema.safeParse(calls[0]!.body);
    expect(parsed.error?.issues, "deviceRegisterBodySchema rejected the register body").toBeUndefined();
  });

  it("register body parses against deviceRegisterBodySchema (without locale)", async () => {
    const { api, calls } = recordingClient();
    await api.register("fcm-xyz", "android");
    const parsed = deviceRegisterBodySchema.safeParse(calls[0]!.body);
    expect(parsed.error?.issues, "deviceRegisterBodySchema rejected the register body").toBeUndefined();
  });
});
