import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  countDocs,
  createDoc,
  createUpload,
  deleteAll,
  getGlobal,
  updateGlobal,
} from "./payload-client";

/**
 * These run against a stubbed fetch rather than a live Payload. The point is
 * not that HTTP works — it is the two things a one-shot production import
 * cannot get wrong and cannot easily re-test afterwards: that *every* write
 * carries ?skipRebuild=true (issue #165: "No rebuild-dispatch storm during the
 * run"), and that a non-2xx response aborts instead of being counted as a
 * success.
 */
function stubFetch(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The URL the single stubbed call was made with. */
function calledUrl(fetchMock: ReturnType<typeof vi.fn>): URL {
  return new URL(fetchMock.mock.calls[0]?.[0] as string);
}

beforeEach(() => {
  vi.stubEnv("CMS_URL", "https://cms.example.de");
  vi.stubEnv("CMS_API_TOKEN", "tok");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("environment contract", () => {
  it.each(["CMS_URL", "CMS_API_TOKEN"])("throws by name when %s is missing", async (name) => {
    stubFetch({ doc: { id: 1 } });
    vi.stubEnv(name, "");
    await expect(createDoc("pages", {})).rejects.toThrow(`${name} is not set`);
  });
});

describe("every write skips the rebuild dispatch", () => {
  // Parameterised over all four write paths on purpose: a fifth one added
  // later without going through writeUrl is exactly the regression that would
  // fire ~130 repository_dispatch events at dragons-hub mid-migration.
  const writes: [name: string, run: () => Promise<unknown>][] = [
    ["createDoc", () => createDoc("pages", { slug: "x" })],
    ["createUpload", () => createUpload("media", new Blob(["x"]), "a.png", { alt: null })],
    ["updateGlobal", () => updateGlobal("team-background", { image: 1 })],
    ["deleteAll", () => deleteAll("pages")],
  ];

  it.each(writes)("%s sets skipRebuild=true", async (_name, run) => {
    const fetchMock = stubFetch({ doc: { id: 1 }, docs: [] });
    await run();
    expect(calledUrl(fetchMock).searchParams.get("skipRebuild")).toBe("true");
  });
});

describe("createDoc", () => {
  it("posts JSON to the collection and returns the created doc", async () => {
    const fetchMock = stubFetch({ doc: { id: 7 } });

    expect(await createDoc("pages", { slug: "kontakt" })).toEqual({ id: 7 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname).toBe("/api/pages");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ slug: "kontakt" }));
    expect((init.headers as Record<string, string>).Authorization).toBe("users API-Key tok");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("throws with the status and body when Payload rejects the write", async () => {
    stubFetch({ errors: ["nope"] }, false, 422);
    await expect(createDoc("pages", {})).rejects.toThrow(/create pages: HTTP 422/);
  });
});

describe("createUpload", () => {
  it("sends multipart with the file and _payload, and no Content-Type", async () => {
    const fetchMock = stubFetch({ doc: { id: 9 } });

    expect(await createUpload("media", new Blob(["x"]), "logo.png", { alt: "Logo" })).toEqual({
      id: 9,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const form = init.body as FormData;
    expect(form.get("_payload")).toBe(JSON.stringify({ alt: "Logo" }));
    expect((form.get("file") as File).name).toBe("logo.png");
    // fetch has to set the multipart boundary itself; naming a Content-Type
    // here would produce one without a boundary and Payload would reject it.
    expect(init.headers).not.toHaveProperty("Content-Type");
  });

  it("names the file in the error when the upload fails", async () => {
    stubFetch({}, false, 500);
    await expect(
      createUpload("media", new Blob(["x"]), "logo.png", {}),
    ).rejects.toThrow(/upload logo\.png: HTTP 500/);
  });
});

describe("updateGlobal", () => {
  it("posts to the globals path", async () => {
    const fetchMock = stubFetch({});
    await updateGlobal("background-video", { video: 3 });
    expect(calledUrl(fetchMock).pathname).toBe("/api/globals/background-video");
  });

  it("throws when the global write fails", async () => {
    stubFetch({}, false, 403);
    await expect(updateGlobal("background-video", {})).rejects.toThrow(
      /global background-video: HTTP 403/,
    );
  });
});

describe("deleteAll", () => {
  it("matches every document and returns how many were deleted", async () => {
    const fetchMock = stubFetch({ docs: [{ id: 1 }, { id: 2 }, { id: 3 }] });

    expect(await deleteAll("posts")).toBe(3);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("DELETE");
    // Payload requires a `where`; this is the one that matches everything.
    expect(new URL(url).searchParams.get("where[id][exists]")).toBe("true");
  });
});

describe("getGlobal", () => {
  it("reads at depth=0 so a relation arrives as a bare id", async () => {
    const fetchMock = stubFetch({ image: 42 });

    expect(await getGlobal("team-background")).toEqual({ image: 42 });

    const url = calledUrl(fetchMock);
    expect(url.searchParams.get("depth")).toBe("0");
    // A read, so it must NOT carry the write-only skipRebuild flag.
    expect(url.searchParams.get("skipRebuild")).toBeNull();
  });
});

describe("countDocs", () => {
  it("asks for totalDocs only", async () => {
    const fetchMock = stubFetch({ totalDocs: 73, docs: [] });

    expect(await countDocs("media")).toBe(73);

    const url = calledUrl(fetchMock);
    expect(url.searchParams.get("limit")).toBe("0");
    expect(url.searchParams.get("depth")).toBe("0");
  });

  it("throws rather than reporting a count when the read fails", async () => {
    stubFetch({}, false, 404);
    await expect(countDocs("media")).rejects.toThrow(/count media: HTTP 404/);
  });
});

describe("base URL handling", () => {
  it("does not double the slash when CMS_URL has a trailing one", async () => {
    vi.stubEnv("CMS_URL", "https://cms.example.de/");
    const fetchMock = stubFetch({ doc: { id: 1 } });
    await createDoc("pages", {});
    expect(calledUrl(fetchMock).pathname).toBe("/api/pages");
  });
});
