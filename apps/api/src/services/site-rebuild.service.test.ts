import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// --- Mocks (hoisted before imports) ---

const mocks = vi.hoisted(() => ({
  env: {} as { GH_DISPATCH_TOKEN?: string },
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("../config/env", () => ({ env: mocks.env }));

vi.mock("../config/logger", () => ({
  logger: { child: () => mocks.log },
}));

// --- Imports (after mocks) ---

import { dispatchSiteRebuild, SITE_REBUILD_EVENT_TYPE } from "./site-rebuild.service";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  delete mocks.env.GH_DISPATCH_TOKEN;
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dispatchSiteRebuild", () => {
  it("posts a repository_dispatch carrying the reason", async () => {
    mocks.env.GH_DISPATCH_TOKEN = "ghp_test";
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await dispatchSiteRebuild("team staff change");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.github.com/repos/hb-dragons/dragons-hub/dispatches");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer ghp_test");
    expect(init.headers["User-Agent"]).toBe("dragons-hub-api");
    expect(JSON.parse(init.body)).toEqual({
      event_type: SITE_REBUILD_EVENT_TYPE,
      client_payload: { reason: "team staff change" },
    });
    expect(mocks.log.info).toHaveBeenCalled();
  });

  it("skips and logs without a dispatch token", async () => {
    await dispatchSiteRebuild("team staff change");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.log.warn).toHaveBeenCalledWith(
      { reason: "team staff change" },
      "GH_DISPATCH_TOKEN not configured, skipping site rebuild dispatch",
    );
  });

  it("logs and swallows a GitHub error response", async () => {
    mocks.env.GH_DISPATCH_TOKEN = "ghp_test";
    fetchMock.mockResolvedValue(new Response("nope", { status: 403 }));

    await expect(dispatchSiteRebuild("team staff delete")).resolves.toBeUndefined();

    expect(mocks.log.error).toHaveBeenCalledWith(
      { status: 403, errorText: "nope", reason: "team staff delete" },
      "Site rebuild dispatch failed",
    );
  });

  it("logs and swallows a network failure", async () => {
    mocks.env.GH_DISPATCH_TOKEN = "ghp_test";
    fetchMock.mockRejectedValue(new Error("offline"));

    await expect(dispatchSiteRebuild("team staff change")).resolves.toBeUndefined();

    expect(mocks.log.error).toHaveBeenCalled();
  });
});
