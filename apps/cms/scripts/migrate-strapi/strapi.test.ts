import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildStrapiUrl,
  downloadFile,
  fetchAll,
  fetchSingle,
  fetchUploads,
  isLastPage,
  mergePages,
} from "./strapi";

describe("buildStrapiUrl", () => {
  it("asks for published documents by default and a full page", () => {
    const url = buildStrapiUrl("https://cms.example.de", "posts", 1, {});
    // URLSearchParams's application/x-www-form-urlencoded serialization
    // leaves "*" unescaped (verified on Node 24 and Bun 1.3) — RFC 3986
    // percent-encoding would use %2A, but that is not what this runtime does.
    expect(url).toBe(
      "https://cms.example.de/api/posts?pagination%5Bpage%5D=1&pagination%5BpageSize%5D=100&populate=*&status=published",
    );
  });

  it("strips a trailing slash from the base so the path is not doubled", () => {
    const url = buildStrapiUrl("https://cms.example.de/", "teams", 2, {});
    expect(url).toContain("https://cms.example.de/api/teams?");
    expect(url).not.toContain("//api");
  });

  it("lets a caller override status to read drafts", () => {
    const url = buildStrapiUrl("https://cms.example.de", "partners", 1, { status: "draft" });
    expect(url).toContain("status=draft");
    // A non-populate override must not suppress the default populate=* — only
    // an override that itself supplies a populate key should do that (see the
    // "replaces the blanket populate=*" case below). A guard narrowed to
    // "any override at all" would pass every other case in this file while
    // silently nulling every partner logo.
    expect(url).toContain("populate=*");
  });

  it("replaces the blanket populate=* with a deep-populate override rather than appending it", () => {
    const url = buildStrapiUrl("https://cms.example.de", "teams", 1, {
      "populate[training][populate]": "*",
      "populate[teamImage]": "true",
    });
    // The deep-populate keys are present...
    expect(url).toContain("populate%5Btraining%5D%5Bpopulate%5D=*");
    expect(url).toContain("populate%5BteamImage%5D=true");
    // ...and the blanket populate=* this would otherwise carry is gone, not
    // merely joined by an "&" alongside it.
    expect(url).not.toContain("populate=*");
  });
});

describe("mergePages", () => {
  it("concatenates pages in order", () => {
    expect(mergePages([[{ id: 1 }], [{ id: 2 }, { id: 3 }]])).toEqual([
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ]);
  });
});

describe("isLastPage", () => {
  it("is false while the current page trails pageCount", () => {
    expect(isLastPage("posts", 1, 3)).toBe(false);
  });

  it("is true once the current page reaches pageCount", () => {
    expect(isLastPage("posts", 3, 3)).toBe(true);
  });

  it("throws instead of looping forever when pageCount is missing", () => {
    expect(() => isLastPage("posts", 1, undefined)).toThrow(
      "strapi: posts page 1 has a non-numeric pageCount (undefined)",
    );
  });

  it("throws when pageCount is present but not a number", () => {
    expect(() => isLastPage("teams", 2, "3")).toThrow(/non-numeric pageCount \("3"\)/);
  });

  it("throws on a non-finite pageCount (NaN, Infinity)", () => {
    expect(() => isLastPage("teams", 1, Number.NaN)).toThrow(/non-numeric pageCount/);
    expect(() => isLastPage("teams", 1, Number.POSITIVE_INFINITY)).toThrow(/non-numeric pageCount/);
  });
});

/**
 * The network half. Stubbed fetch, because what matters is not that HTTP
 * works but that the migration reads *every* page (a silently truncated read
 * migrates a partial club), sends the bearer token, and fails loudly on a
 * non-2xx instead of returning a short list that the count check would then
 * compare against an equally short one.
 */
function stubJson(bodies: unknown[], ok = true, status = 200) {
  const fetchMock = vi.fn();
  for (const body of bodies) {
    fetchMock.mockResolvedValueOnce({ ok, status, json: async () => body });
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function page(docs: unknown[], pageCount: number) {
  return { data: docs, meta: { pagination: { pageCount } } };
}

describe("network reads", () => {
  beforeEach(() => {
    vi.stubEnv("STRAPI_URL", "http://192.168.1.50:1337");
    vi.stubEnv("STRAPI_TOKEN", "tok");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each(["STRAPI_URL", "STRAPI_TOKEN"])("throws by name when %s is missing", async (name) => {
    stubJson([page([], 1)]);
    vi.stubEnv(name, "");
    await expect(fetchAll("posts")).rejects.toThrow(`${name} is not set`);
  });

  describe("fetchAll", () => {
    it("follows pagination to the last page and concatenates every document", async () => {
      const fetchMock = stubJson([
        page([{ id: 1 }, { id: 2 }], 3),
        page([{ id: 3 }], 3),
        page([{ id: 4 }], 3),
      ]);

      expect(await fetchAll("posts")).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(new URL(fetchMock.mock.calls[2]?.[0] as string).searchParams.get("pagination[page]"))
        .toBe("3");
    });

    it("sends the token as a bearer header", async () => {
      const fetchMock = stubJson([page([], 1)]);
      await fetchAll("posts");
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    });

    it("passes overrides through to the query", async () => {
      const fetchMock = stubJson([page([], 1)]);
      await fetchAll("partners", { status: "draft" });
      expect(new URL(fetchMock.mock.calls[0]?.[0] as string).searchParams.get("status")).toBe(
        "draft",
      );
    });

    it("throws on a non-2xx rather than returning a short list", async () => {
      stubJson([page([], 1)], false, 502);
      await expect(fetchAll("posts")).rejects.toThrow(/strapi: HTTP 502/);
    });
  });

  describe("fetchSingle", () => {
    it("returns the document with its relations populated", async () => {
      const fetchMock = stubJson([{ data: { id: 1, image: { id: 7 } } }]);

      expect(await fetchSingle("team-background")).toEqual({ id: 1, image: { id: 7 } });
      expect(new URL(fetchMock.mock.calls[0]?.[0] as string).searchParams.get("populate")).toBe("*");
    });

    it("returns null when the single type has no document", async () => {
      stubJson([{ data: null }]);
      expect(await fetchSingle("background-video")).toBeNull();
    });
  });

  describe("fetchUploads", () => {
    it("reads a bare array", async () => {
      stubJson([[{ id: 1, name: "a.png" }]]);
      expect(await fetchUploads()).toEqual([{ id: 1, name: "a.png" }]);
    });

    it("reads the wrapped shape too, in case the upload plugin starts paging", async () => {
      stubJson([{ results: [{ id: 1, name: "a.png" }] }]);
      expect(await fetchUploads()).toEqual([{ id: 1, name: "a.png" }]);
    });
  });

  describe("downloadFile", () => {
    it("resolves a relative url against STRAPI_URL", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["x"]) });
      vi.stubGlobal("fetch", fetchMock);

      await downloadFile("/uploads/a_abc.png");

      expect(fetchMock.mock.calls[0]?.[0]).toBe("http://192.168.1.50:1337/uploads/a_abc.png");
    });

    it("leaves an absolute url alone", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["x"]) });
      vi.stubGlobal("fetch", fetchMock);

      await downloadFile("https://cdn.example.de/a.png");

      expect(fetchMock.mock.calls[0]?.[0]).toBe("https://cdn.example.de/a.png");
    });

    it("throws with the url when the download fails", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
      await expect(downloadFile("/uploads/gone.png")).rejects.toThrow(
        /strapi download: HTTP 404 for http:\/\/192\.168\.1\.50:1337\/uploads\/gone\.png/,
      );
    });
  });
});
