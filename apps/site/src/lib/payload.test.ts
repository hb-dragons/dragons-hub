import type { LoaderContext } from "astro/loaders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getSiteSettings, payloadLoader } from "./payload";

const CMS_URL = "https://cms.test";
const CMS_API_TOKEN = "build-key";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function payloadPage(docs: { id: number }[], hasNextPage: boolean) {
  return jsonResponse({ docs, hasNextPage });
}

/**
 * Minimal stand-in for Astro's loader context: a real map-backed store plus a
 * pass-through parseData, so assertions run against what the loader stored.
 */
function loaderHarness() {
  const entries = new Map<string, unknown>();
  const warn = vi.fn();
  const context = {
    store: {
      clear: () => entries.clear(),
      set: (entry: { id: string; data: unknown }) => {
        entries.set(entry.id, entry.data);
        return true;
      },
    },
    parseData: async ({ data }: { id: string; data: unknown }) => data,
    logger: { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
  } as unknown as LoaderContext;
  return { entries, warn, context };
}

beforeEach(() => {
  vi.stubEnv("CMS_URL", CMS_URL);
  vi.stubEnv("CMS_API_TOKEN", CMS_API_TOKEN);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("payloadLoader content gate", () => {
  // An expired CMS token degrades to anonymous reads rather than a 403, so the
  // build used to succeed with every draft — or every document — missing, and
  // shipped an empty site past every gate (#269).
  it("fails a configured build when a required collection comes back empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(payloadPage([], false)));
    const { context } = loaderHarness();

    await expect(payloadLoader("teams", { required: true }).load(context)).rejects.toThrow(
      /teams.*empty/i,
    );
  });

  it("accepts a required collection that has documents", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(payloadPage([{ id: 1 }], false)));
    const { entries, context } = loaderHarness();

    await payloadLoader("teams", { required: true }).load(context);

    expect([...entries.keys()]).toEqual(["1"]);
  });

  it("leaves an optional collection free to be empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(payloadPage([], false)));
    const { context } = loaderHarness();

    await expect(payloadLoader("downloads").load(context)).resolves.toBeUndefined();
  });

  it("says nothing about emptiness on an env-less shell build", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("CMS_URL", "");
    vi.stubEnv("CMS_API_TOKEN", "");
    const { context, warn } = loaderHarness();

    await expect(payloadLoader("teams", { required: true }).load(context)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});

describe("payloadLoader", () => {
  it("pages through the REST API until hasNextPage is false and stores every doc", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(payloadPage([{ id: 1 }, { id: 2 }], true))
      .mockResolvedValueOnce(payloadPage([{ id: 3 }], false));
    vi.stubGlobal("fetch", fetchMock);
    const { entries, context } = loaderHarness();

    await payloadLoader("posts").load(context);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = new URL(fetchMock.mock.calls[0]?.[0] as string);
    const secondUrl = new URL(fetchMock.mock.calls[1]?.[0] as string);
    expect(firstUrl.searchParams.get("page")).toBe("1");
    expect(secondUrl.searchParams.get("page")).toBe("2");
    expect([...entries.keys()]).toEqual(["1", "2", "3"]);
  });

  it("requests with the API-key header, limit 100 and the configured depth and sort", async () => {
    const fetchMock = vi.fn().mockResolvedValue(payloadPage([], false));
    vi.stubGlobal("fetch", fetchMock);
    const { context } = loaderHarness();

    await payloadLoader("teams", { depth: 3, sort: "_order" }).load(context);

    const [rawUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const url = new URL(rawUrl);
    expect(url.origin).toBe(CMS_URL);
    expect(url.pathname).toBe("/api/teams");
    expect(url.searchParams.get("limit")).toBe("100");
    expect(url.searchParams.get("depth")).toBe("3");
    expect(url.searchParams.get("sort")).toBe("_order");
    expect(init.headers).toEqual({
      Authorization: `users API-Key ${CMS_API_TOKEN}`,
    });
  });

  it("preserves a path prefix in CMS_URL", async () => {
    vi.stubEnv("CMS_URL", "https://cms.test/sub");
    const fetchMock = vi.fn().mockResolvedValue(payloadPage([], false));
    vi.stubGlobal("fetch", fetchMock);
    const { context } = loaderHarness();

    await payloadLoader("posts").load(context);

    expect(new URL(fetchMock.mock.calls[0]?.[0] as string).pathname).toBe("/sub/api/posts");
  });

  it("clears previously stored entries before syncing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(payloadPage([{ id: 7 }], false)));
    const { entries, context } = loaderHarness();
    entries.set("stale", { id: 999 });

    await payloadLoader("posts").load(context);

    expect([...entries.keys()]).toEqual(["7"]);
  });

  it("throws on a non-200 response so the build fails instead of prerendering empty pages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ errors: [] }, 500)));
    const { context } = loaderHarness();

    await expect(payloadLoader("posts").load(context)).rejects.toThrow(
      "payload posts: HTTP 500",
    );
  });

  it("throws when a 200 response is not a Payload page envelope", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ nope: true })));
    const { context } = loaderHarness();

    await expect(payloadLoader("posts").load(context)).rejects.toThrow(
      "payload posts: unexpected response shape",
    );
  });

  it("leaves the collection empty and warns when no CMS env is configured", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("CMS_URL", "");
    vi.stubEnv("CMS_API_TOKEN", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { entries, warn, context } = loaderHarness();

    await payloadLoader("posts").load(context);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(entries.size).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("CMS_URL"));
  });

  it.each([
    { set: "CMS_URL", value: CMS_URL, missing: "CMS_API_TOKEN" },
    { set: "CMS_API_TOKEN", value: CMS_API_TOKEN, missing: "CMS_URL" },
  ])("throws when only $set is configured", async ({ set, value, missing }) => {
    vi.unstubAllEnvs();
    vi.stubEnv("CMS_URL", "");
    vi.stubEnv("CMS_API_TOKEN", "");
    vi.stubEnv(set, value);
    vi.stubGlobal("fetch", vi.fn());
    const { context } = loaderHarness();

    await expect(payloadLoader("posts").load(context)).rejects.toThrow(missing);
  });
});

describe("getSiteSettings", () => {
  it("fetches the site-settings global with the API-key header", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ memberCount: 214, foundingYear: 2013 }));
    vi.stubGlobal("fetch", fetchMock);

    const settings = await getSiteSettings();

    expect(settings).toEqual({ memberCount: 214, foundingYear: 2013 });
    const [rawUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(rawUrl).pathname).toBe("/api/globals/site-settings");
    expect(init.headers).toEqual({
      Authorization: `users API-Key ${CMS_API_TOKEN}`,
    });
  });

  it("throws on a non-200 response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 503)));

    await expect(getSiteSettings()).rejects.toThrow(
      "payload site-settings: HTTP 503",
    );
  });

  it("returns null when no CMS env is configured", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("CMS_URL", "");
    vi.stubEnv("CMS_API_TOKEN", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(getSiteSettings()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
