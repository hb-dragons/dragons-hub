import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { strapiBlocksToLexical } from "./convert-blocks";
import { SEEDED_PAGES } from "./mappers";
import { migrateMedia } from "./media";
import { main } from "./migrate";
import { countDocs, createDoc, deleteAll, getGlobal, updateGlobal } from "./payload-client";
import { fetchAll, fetchSingle, fetchUploads, type StrapiDoc } from "./strapi";

/**
 * The orchestrator is mocked at its I/O boundary only — the real mappers run,
 * because what these tests pin is the *sequence*: wipe before write, media
 * before everything that references it, and a verification pass that exits
 * non-zero rather than reporting a clean run over a partial one. It is the one
 * module nothing else can check, and it runs once, against production.
 */
vi.mock("./strapi", () => ({
  fetchAll: vi.fn(),
  fetchSingle: vi.fn(),
  fetchUploads: vi.fn(),
}));
vi.mock("./payload-client", () => ({
  countDocs: vi.fn(),
  createDoc: vi.fn(),
  deleteAll: vi.fn(),
  getGlobal: vi.fn(),
  updateGlobal: vi.fn(),
}));
vi.mock("./media", () => ({ migrateMedia: vi.fn() }));
vi.mock("./convert-blocks", () => ({ strapiBlocksToLexical: vi.fn() }));

const fetchAllMock = vi.mocked(fetchAll);
const fetchSingleMock = vi.mocked(fetchSingle);
const fetchUploadsMock = vi.mocked(fetchUploads);
const countDocsMock = vi.mocked(countDocs);
const createDocMock = vi.mocked(createDoc);
const deleteAllMock = vi.mocked(deleteAll);
const getGlobalMock = vi.mocked(getGlobal);
const updateGlobalMock = vi.mocked(updateGlobal);
const migrateMediaMock = vi.mocked(migrateMedia);
const toLexicalMock = vi.mocked(strapiBlocksToLexical);

function doc(id: number, extra: Record<string, unknown> = {}): StrapiDoc {
  return { id, documentId: `d${id}`, publishedAt: "2026-01-01T00:00:00.000Z", ...extra };
}

/** One document per Strapi type, with the two team slugs the hand-map knows. */
const WORLD: Record<string, StrapiDoc[]> = {
  teams: [doc(1, { slug: "damen-1", name: "Damen 1", training: [] })],
  ehrenamtliches: [doc(2, { name: "A" })],
  positions: [doc(3, { name: "Kassenwart" })],
  vorstands: [doc(4, { name: "Kassenwart" })],
  trainers: [doc(5, { name: "T" })],
  schiedsrichters: [doc(6, { name: "S" })],
  // Two, out of id order, so the sort that makes orderIndex deterministic
  // across runs actually has something to do.
  partners: [doc(15, { name: "P2" }), doc(7, { name: "P1" })],
  projects: [doc(8, { name: "Pr" })],
  downloads: [doc(9, { name: "D" })],
  "shop-items": [doc(10, { name: "Sh" })],
  "timeline-items": [doc(11, { headline: "H", date: "2020-01-01" })],
  pages: [doc(12, { slug: "kontakt", header: { title: "Kontakt", image: null } })],
  posts: [doc(13, { slug: "ein-post", header: { title: "Ein Post", image: null }, content: [] })],
};

/** Payload docs created per collection, so countDocs can agree by default. */
let created: Map<string, number>;
let exitCalls: number[];

/** Thrown by the process.exit stub so control flow stops where the real one would. */
class ExitError extends Error {}

beforeEach(() => {
  created = new Map();
  exitCalls = [];

  fetchAllMock.mockImplementation(async (type: string) => WORLD[type] ?? []);
  fetchUploadsMock.mockResolvedValue([]);
  fetchSingleMock.mockResolvedValue(null);
  migrateMediaMock.mockResolvedValue(new Map());
  toLexicalMock.mockResolvedValue({ root: {} });
  deleteAllMock.mockResolvedValue(0);
  getGlobalMock.mockResolvedValue({});
  updateGlobalMock.mockResolvedValue(undefined);

  let nextId = 100;
  createDocMock.mockImplementation(async (collection: string) => {
    created.set(collection, (created.get(collection) ?? 0) + 1);
    nextId += 1;
    return { id: nextId };
  });
  // Agrees with whatever was actually written, so the happy path verifies
  // clean and a test that wants a mismatch has to introduce one.
  countDocsMock.mockImplementation(async (collection: string) => created.get(collection) ?? 0);

  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(process, "exit").mockImplementation(((code: number) => {
    exitCalls.push(code);
    throw new ExitError(`exit ${code}`);
  }) as never);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

/** Runs main, swallowing only the sentinel our process.exit stub throws. */
async function runMain(): Promise<void> {
  try {
    await main();
  } catch (error) {
    if (!(error instanceof ExitError)) throw error;
  }
}

describe("preflight", () => {
  it("aborts before touching Payload when a team slug has no permanent id", async () => {
    fetchAllMock.mockImplementation(async (type: string) =>
      type === "teams" ? [doc(1, { slug: "u10", name: "U10" })] : (WORLD[type] ?? []),
    );

    await expect(main()).rejects.toThrow(/TEAM_PERMANENT_IDS has no entry for: u10/);

    // The critical half: a run that fails preflight must not have wiped
    // anything, or the club is left with an empty CMS and no import.
    expect(deleteAllMock).not.toHaveBeenCalled();
    expect(createDocMock).not.toHaveBeenCalled();
  });
});

describe("wipe", () => {
  it("deletes in reverse dependency order, before the first write", async () => {
    const order: string[] = [];
    deleteAllMock.mockImplementation(async (c: string) => {
      order.push(`delete:${c}`);
      return 0;
    });
    createDocMock.mockImplementation(async (c: string) => {
      order.push(`create:${c}`);
      created.set(c, (created.get(c) ?? 0) + 1);
      return { id: 1 };
    });

    await runMain();

    const deletes = order.filter((step) => step.startsWith("delete:"));
    expect(deletes[0]).toBe("delete:posts");
    expect(deletes.at(-1)).toBe("delete:media");
    // Every delete precedes every create.
    expect(order.findIndex((s) => s.startsWith("create:"))).toBeGreaterThan(
      order.findLastIndex((s) => s.startsWith("delete:")),
    );
  });
});

describe("migration order", () => {
  it("writes media first, then people before the collections that reference them", async () => {
    const order: string[] = [];
    migrateMediaMock.mockImplementation(async () => {
      order.push("media");
      return new Map();
    });
    createDocMock.mockImplementation(async (c: string) => {
      if (order.at(-1) !== c) order.push(c);
      created.set(c, (created.get(c) ?? 0) + 1);
      return { id: 1 };
    });

    await runMain();

    expect(order).toEqual([
      "media",
      "people",
      "positions",
      "vorstand",
      "trainers",
      "referees",
      "teams",
      "partners",
      "projects",
      "downloads",
      "shop-items",
      "timeline-items",
      "pages",
      "posts",
    ]);
  });

  it("labels the content converter with the post's resolved slug", async () => {
    await runMain();
    expect(toLexicalMock).toHaveBeenCalledWith([], expect.any(Map), "ein-post");
  });

  it("labels it with a title-derived slug when Strapi left the post without one", async () => {
    fetchAllMock.mockImplementation(async (type: string) =>
      type === "posts"
        ? [doc(13, { slug: null, header: { title: "Caritas Spendenspieltag" }, content: [] })]
        : (WORLD[type] ?? []),
    );

    await runMain();

    expect(toLexicalMock).toHaveBeenCalledWith(
      [],
      expect.any(Map),
      "caritas-spendenspieltag",
    );
  });
});

describe("partners", () => {
  it("writes them in id order, so orderIndex is stable across runs", async () => {
    // The live API does not return partners in id order (verified 2026-08-03),
    // and orderIndex is assigned from the write loop's counter — without the
    // sort, a re-run would silently reshuffle the supporter page.
    await runMain();

    const names = createDocMock.mock.calls
      .filter(([collection]) => collection === "partners")
      .map(([, data]) => (data as { name: string }).name);

    expect(names).toEqual(["P1", "P2"]);
  });
});

describe("seeded pages", () => {
  it("writes the pages Strapi never had, on top of the migrated ones", async () => {
    await runMain();

    const pageSlugs = createDocMock.mock.calls
      .filter(([collection]) => collection === "pages")
      .map(([, data]) => (data as { slug: string }).slug);

    expect(pageSlugs).toContain("kontakt");
    for (const seeded of SEEDED_PAGES) expect(pageSlugs).toContain(seeded.slug);
  });
});

describe("globals", () => {
  it("skips the write entirely when Strapi has no such document", async () => {
    await runMain();
    expect(updateGlobalMock).not.toHaveBeenCalled();
  });

  it("maps the media id through when Strapi has one", async () => {
    fetchSingleMock.mockImplementation(async (type: string) =>
      type === "team-background" ? doc(1, { image: { id: 7 } }) : null,
    );
    migrateMediaMock.mockResolvedValue(new Map([[7, 42]]));
    getGlobalMock.mockResolvedValue({ image: 42 });

    await runMain();

    expect(updateGlobalMock).toHaveBeenCalledWith("team-background", { image: 42 });
  });

  it("writes null for a cleared field rather than aborting the run", async () => {
    // An editor unsetting the image is not an error, and must not strand a
    // run that has already wiped and refilled all fourteen collections.
    fetchSingleMock.mockImplementation(async (type: string) =>
      type === "background-video" ? doc(1, { video: null }) : null,
    );

    await runMain();

    expect(updateGlobalMock).toHaveBeenCalledWith("background-video", { video: null });
    expect(exitCalls).toEqual([]);
  });

  it("fails the run when Strapi had a media id but Payload came back without one", async () => {
    fetchSingleMock.mockImplementation(async (type: string) =>
      type === "team-background" ? doc(1, { image: { id: 7 } }) : null,
    );
    migrateMediaMock.mockResolvedValue(new Map([[7, 42]]));
    // The write reported success but the global reads back empty — the exact
    // silent loss the presence check exists to catch.
    getGlobalMock.mockResolvedValue({ image: null });

    await runMain();

    expect(exitCalls).toEqual([1]);
  });
});

describe("verification", () => {
  it("exits 0 — by not exiting — when every count agrees", async () => {
    await runMain();
    expect(exitCalls).toEqual([]);
  });

  it("counts the seeded pages as Payload's expected surplus", async () => {
    // pages is the one collection where Payload deliberately holds more than
    // Strapi; comparing raw counts would fail a correct run.
    await runMain();
    expect(exitCalls).toEqual([]);
    expect(created.get("pages")).toBe(1 + SEEDED_PAGES.length);
  });

  it("exits 1 when a collection count does not match", async () => {
    countDocsMock.mockImplementation(async (collection: string) =>
      collection === "posts" ? 0 : (created.get(collection) ?? 0),
    );

    await runMain();

    expect(exitCalls).toEqual([1]);
  });

  it("exits 1 when the media count does not match", async () => {
    fetchUploadsMock.mockResolvedValue([
      { id: 1, name: "a", url: "/a.png", mime: "image/png", size: 1, alternativeText: null },
    ]);
    // migrateMedia returned an empty map, so Payload holds nothing.

    await runMain();

    expect(exitCalls).toEqual([1]);
  });
});
