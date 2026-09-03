import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildTeamsUrl, fetchTeams, isLastPage } from "./cms";

describe("buildTeamsUrl", () => {
  it("asks for depth 2, so trainer.person carries the name", () => {
    const url = new URL(buildTeamsUrl("https://cms.example.de", 2));

    expect(url.pathname).toBe("/api/teams");
    expect(url.searchParams.get("depth")).toBe("2");
    expect(url.searchParams.get("limit")).toBe("100");
    expect(url.searchParams.get("page")).toBe("2");
  });

  it("tolerates a trailing slash on the base", () => {
    expect(buildTeamsUrl("https://cms.example.de/", 1)).toContain("https://cms.example.de/api/teams");
  });
});

describe("isLastPage", () => {
  it("stops on the last page", () => {
    expect(isLastPage(1, 2)).toBe(false);
    expect(isLastPage(2, 2)).toBe(true);
  });

  it("throws rather than looping forever on a missing page count", () => {
    expect(() => isLastPage(1, undefined)).toThrow(/totalPages/);
    expect(() => isLastPage(1, Number.NaN)).toThrow(/totalPages/);
  });
});

describe("fetchTeams", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("CMS_URL", "https://cms.example.de");
    vi.stubEnv("CMS_API_TOKEN", "token");
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function page(docs: unknown[], totalPages: number) {
    return { ok: true, json: () => Promise.resolve({ docs, totalPages }) };
  }

  it("walks every page and sends the API key", async () => {
    fetchMock
      .mockResolvedValueOnce(page([{ id: 1 }], 2))
      .mockResolvedValueOnce(page([{ id: 2 }], 2));

    expect(await fetchTeams()).toEqual([{ id: 1 }, { id: 2 }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({
      headers: { Authorization: "users API-Key token" },
    });
  });

  it("throws on a non-ok response", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403 });

    await expect(fetchTeams()).rejects.toThrow(/HTTP 403/);
  });

  it("throws by name when the CMS environment is missing", async () => {
    vi.stubEnv("CMS_URL", "");

    await expect(fetchTeams()).rejects.toThrow("CMS_URL is not set");
  });

  it("throws by name when the token is missing", async () => {
    fetchMock.mockResolvedValueOnce(page([], 1));
    vi.stubEnv("CMS_API_TOKEN", "");

    await expect(fetchTeams()).rejects.toThrow("CMS_API_TOKEN is not set");
  });
});
