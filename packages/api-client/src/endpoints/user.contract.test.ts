import { describe, it, expect, vi } from "vitest";
import { userRefereeLinkBodySchema } from "@dragons/contracts";
import { ApiClient } from "../client";
import { userEndpoints } from "./user";

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
  return { api: userEndpoints(client), calls };
}

describe("user request bodies satisfy @dragons/contracts schemas", () => {
  it("linkReferee body (linking) parses against userRefereeLinkBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.linkReferee("user-123", { refereeId: 42 });
    const parsed = userRefereeLinkBodySchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "userRefereeLinkBodySchema rejected the link body",
    ).toBeUndefined();
    expect(new URL(calls[0]!.url).pathname).toBe(
      "/admin/users/user-123/referee-link",
    );
    expect(calls[0]!.method).toBe("PATCH");
  });

  it("linkReferee body (unlinking) parses against userRefereeLinkBodySchema", async () => {
    const { api, calls } = recordingClient();
    await api.linkReferee("user-123", { refereeId: null });
    const parsed = userRefereeLinkBodySchema.safeParse(calls[0]!.body);
    expect(
      parsed.error?.issues,
      "userRefereeLinkBodySchema rejected the unlink body",
    ).toBeUndefined();
    expect(new URL(calls[0]!.url).pathname).toBe(
      "/admin/users/user-123/referee-link",
    );
    expect(calls[0]!.method).toBe("PATCH");
  });
});
