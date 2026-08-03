import type { CollectionConfig, GlobalConfig } from "payload";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Downloads } from "../collections/downloads";
import { Media } from "../collections/media";
import { Pages } from "../collections/pages";
import { Partners } from "../collections/partners";
import { People } from "../collections/people";
import { Positions } from "../collections/positions";
import { Posts } from "../collections/posts";
import { Projects } from "../collections/projects";
import { Referees } from "../collections/referees";
import { ShopItems } from "../collections/shop-items";
import { Teams } from "../collections/teams";
import { TimelineItems } from "../collections/timeline-items";
import { Trainers } from "../collections/trainers";
import { Users } from "../collections/users";
import { Vorstand } from "../collections/vorstand";
import { BackgroundVideo } from "../globals/background-video";
import { SiteSettings } from "../globals/site-settings";
import { TeamBackground } from "../globals/team-background";
import {
  dispatchGlobalOnChange,
  dispatchOnDelete,
  dispatchOnPublish,
  shouldSkipRebuild,
} from "./dispatch-rebuild";

const DISPATCH_URL = "https://api.github.com/repos/hb-dragons/dragons-hub/dispatches";

type ChangeArgs = Parameters<typeof dispatchOnPublish>[0];
type DeleteArgs = Parameters<typeof dispatchOnDelete>[0];
type GlobalArgs = Parameters<typeof dispatchGlobalOnChange>[0];

const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));

function skipRebuildSearchParams(skipRebuildParam?: string) {
  return new URLSearchParams(skipRebuildParam === undefined ? {} : { skipRebuild: skipRebuildParam });
}

function changeArgs({
  status,
  previousStatus,
  skipRebuild = false,
  skipRebuildParam,
}: {
  status?: string;
  previousStatus?: string;
  skipRebuild?: boolean;
  skipRebuildParam?: string;
} = {}) {
  return {
    doc: { id: 1, _status: status },
    previousDoc: { id: 1, _status: previousStatus },
    req: { context: skipRebuild ? { skipRebuild: true } : {}, searchParams: skipRebuildSearchParams(skipRebuildParam) },
    collection: { slug: "posts" },
  } as unknown as ChangeArgs;
}

function deleteArgs({
  skipRebuild = false,
  skipRebuildParam,
}: { skipRebuild?: boolean; skipRebuildParam?: string } = {}) {
  return {
    doc: { id: 1 },
    req: { context: skipRebuild ? { skipRebuild: true } : {}, searchParams: skipRebuildSearchParams(skipRebuildParam) },
    collection: { slug: "posts" },
  } as unknown as DeleteArgs;
}

function globalArgs({
  skipRebuild = false,
  skipRebuildParam,
}: { skipRebuild?: boolean; skipRebuildParam?: string } = {}) {
  return {
    doc: { memberCount: 300 },
    previousDoc: { memberCount: 200 },
    req: { context: skipRebuild ? { skipRebuild: true } : {}, searchParams: skipRebuildSearchParams(skipRebuildParam) },
    global: { slug: "site-settings" },
  } as unknown as GlobalArgs;
}

beforeEach(() => {
  vi.stubEnv("GH_DISPATCH_TOKEN", "test-token");
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockClear();
  fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));
});

describe("shouldSkipRebuild", () => {
  it("is true when the query string carries ?skipRebuild=true", () => {
    expect(
      shouldSkipRebuild({ searchParams: new URLSearchParams({ skipRebuild: "true" }) }),
    ).toBe(true);
  });

  it("is case-sensitive: ?skipRebuild=TRUE does not skip", () => {
    expect(
      shouldSkipRebuild({ searchParams: new URLSearchParams({ skipRebuild: "TRUE" }) }),
    ).toBe(false);
  });

  it("is true when context.skipRebuild is set (bulk migration writes)", () => {
    expect(shouldSkipRebuild({ context: { skipRebuild: true } })).toBe(true);
  });
});

describe("dispatchOnPublish", () => {
  it("fires a cms-publish repository_dispatch on publish (draft → published)", async () => {
    const doc = await dispatchOnPublish(changeArgs({ status: "published", previousStatus: "draft" }));

    expect(doc).toEqual({ id: 1, _status: "published" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(DISPATCH_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer test-token",
      Accept: "application/vnd.github+json",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      event_type: "cms-publish",
      client_payload: { reason: "posts change" },
    });
  });

  it("fires on unpublish (published → draft)", async () => {
    await dispatchOnPublish(changeArgs({ status: "draft", previousStatus: "published" }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fires on re-publish of an already-published doc (live content changed)", async () => {
    await dispatchOnPublish(changeArgs({ status: "published", previousStatus: "published" }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fires on any change to a draftless collection (no _status: every save is live)", async () => {
    await dispatchOnPublish(changeArgs({}));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stays silent on a draft save", async () => {
    const doc = await dispatchOnPublish(changeArgs({ status: "draft", previousStatus: "draft" }));

    expect(doc).toEqual({ id: 1, _status: "draft" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays silent when context.skipRebuild is set (bulk migration)", async () => {
    await dispatchOnPublish(
      changeArgs({ status: "published", previousStatus: "draft", skipRebuild: true }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not dispatch when the request carries ?skipRebuild=true", async () => {
    await dispatchOnPublish(changeArgs({ status: "published", skipRebuildParam: "true" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still dispatches when the parameter is absent", async () => {
    await dispatchOnPublish(changeArgs({ status: "published" }));

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('ignores a skipRebuild parameter that is not exactly "true"', async () => {
    await dispatchOnPublish(changeArgs({ status: "published", skipRebuildParam: "1" }));

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("tolerates a request with no searchParams at all", async () => {
    const args = { ...changeArgs({ status: "published" }) } as ChangeArgs;
    (args.req as unknown as { searchParams?: URLSearchParams }).searchParams = undefined;

    await dispatchOnPublish(args);

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("stays silent without GH_DISPATCH_TOKEN (dev no-op)", async () => {
    vi.stubEnv("GH_DISPATCH_TOKEN", "");

    await dispatchOnPublish(changeArgs({ status: "published", previousStatus: "draft" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("logs a network failure instead of failing the save", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error("ECONNRESET")));

    const doc = await dispatchOnPublish(changeArgs({ status: "published", previousStatus: "draft" }));

    expect(doc).toEqual({ id: 1, _status: "published" });
    expect(error).toHaveBeenCalledOnce();
  });

  it("logs a non-2xx GitHub API response instead of failing the save", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockImplementationOnce(() => Promise.resolve(new Response(null, { status: 401 })));

    const doc = await dispatchOnPublish(changeArgs({ status: "published", previousStatus: "draft" }));

    expect(doc).toEqual({ id: 1, _status: "published" });
    expect(error).toHaveBeenCalledOnce();
  });
});

describe("dispatchOnDelete", () => {
  it("fires on delete", async () => {
    await dispatchOnDelete(deleteArgs());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      event_type: "cms-publish",
      client_payload: { reason: "posts delete" },
    });
  });

  it("stays silent when context.skipRebuild is set", async () => {
    await dispatchOnDelete(deleteArgs({ skipRebuild: true }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not dispatch when the request carries ?skipRebuild=true", async () => {
    await dispatchOnDelete(deleteArgs({ skipRebuildParam: "true" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("hook attachment", () => {
  // Everything the site renders — incl. media (A2): alt text and file
  // replacements change built output too. Users stays out: never rendered.
  const contentCollections: { slug: string; collection: CollectionConfig }[] = [
    { slug: "downloads", collection: Downloads },
    { slug: "media", collection: Media },
    { slug: "pages", collection: Pages },
    { slug: "partners", collection: Partners },
    { slug: "people", collection: People },
    { slug: "positions", collection: Positions },
    { slug: "posts", collection: Posts },
    { slug: "projects", collection: Projects },
    { slug: "referees", collection: Referees },
    { slug: "shop-items", collection: ShopItems },
    { slug: "teams", collection: Teams },
    { slug: "timeline-items", collection: TimelineItems },
    { slug: "trainers", collection: Trainers },
    { slug: "vorstand", collection: Vorstand },
  ];

  it.each(contentCollections)(
    "$slug dispatches a rebuild after change and delete",
    ({ collection }) => {
      // `?? []`: toContain on undefined passes vacuously in vitest 4.
      expect(collection.hooks?.afterChange ?? []).toContain(dispatchOnPublish);
      expect(collection.hooks?.afterDelete ?? []).toContain(dispatchOnDelete);
    },
  );

  it("users never dispatches a rebuild (not rendered on the site)", () => {
    expect(Users.hooks?.afterChange ?? []).not.toContain(dispatchOnPublish);
    expect(Users.hooks?.afterDelete ?? []).not.toContain(dispatchOnDelete);
  });

  const globals: { slug: string; global: GlobalConfig }[] = [
    { slug: "background-video", global: BackgroundVideo },
    { slug: "site-settings", global: SiteSettings },
    { slug: "team-background", global: TeamBackground },
  ];

  it.each(globals)("$slug dispatches a rebuild after change", ({ global }) => {
    expect(global.hooks?.afterChange ?? []).toContain(dispatchGlobalOnChange);
  });
});

describe("dispatchGlobalOnChange", () => {
  it("fires on any global change (globals are draftless)", async () => {
    const doc = await dispatchGlobalOnChange(globalArgs());

    expect(doc).toEqual({ memberCount: 300 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      event_type: "cms-publish",
      client_payload: { reason: "site-settings change" },
    });
  });

  it("stays silent when context.skipRebuild is set", async () => {
    await dispatchGlobalOnChange(globalArgs({ skipRebuild: true }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not dispatch when the request carries ?skipRebuild=true", async () => {
    await dispatchGlobalOnChange(globalArgs({ skipRebuildParam: "true" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
