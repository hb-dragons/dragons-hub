import { describe, it, expect, vi } from "vitest";
import { socialMatchesQuerySchema } from "@dragons/contracts";
import { ApiClient } from "../client";
import { socialEndpoints } from "./social";

/** Build a client whose fetch records the outgoing request url + body. */
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
  return { api: socialEndpoints(client), calls };
}

describe("social request bodies satisfy @dragons/contracts schemas", () => {
  it("matches query parses against socialMatchesQuerySchema", async () => {
    const { api, calls } = recordingClient();
    await api.matches({ type: "preview", week: 23, year: 2026 });
    // GET serializes the query as URL search params — parse what was sent.
    const query = Object.fromEntries(new URL(calls[0]!.url).searchParams);
    const parsed = socialMatchesQuerySchema.safeParse(query);
    expect(parsed.error?.issues, "socialMatchesQuerySchema rejected the matches query").toBeUndefined();
  });

  it("listPlayerPhotos targets the player-photos collection", async () => {
    const { api, calls } = recordingClient();
    await api.listPlayerPhotos();
    expect(calls[0]!.url).toContain("/admin/social/player-photos");
    expect(calls[0]!.method).toBe("GET");
  });

  it("deletePlayerPhoto targets the photo by id with DELETE", async () => {
    const { api, calls } = recordingClient();
    await api.deletePlayerPhoto(7);
    expect(calls[0]!.url).toContain("/admin/social/player-photos/7");
    expect(calls[0]!.method).toBe("DELETE");
  });

  it("listBackgrounds targets the backgrounds collection", async () => {
    const { api, calls } = recordingClient();
    await api.listBackgrounds();
    expect(calls[0]!.url).toContain("/admin/social/backgrounds");
    expect(calls[0]!.method).toBe("GET");
  });

  it("deleteBackground targets the background by id with DELETE", async () => {
    const { api, calls } = recordingClient();
    await api.deleteBackground(4);
    expect(calls[0]!.url).toContain("/admin/social/backgrounds/4");
    expect(calls[0]!.method).toBe("DELETE");
  });

  it("setDefaultBackground patches the background default endpoint", async () => {
    const { api, calls } = recordingClient();
    await api.setDefaultBackground(9);
    expect(calls[0]!.url).toContain("/admin/social/backgrounds/9/default");
    expect(calls[0]!.method).toBe("PATCH");
  });
});
