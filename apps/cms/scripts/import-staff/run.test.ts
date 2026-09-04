import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@dragons/db";

import { downloadMedia, fetchTeams, type CmsTeam, type CmsTrainer } from "./cms";
import type * as CmsModule from "./cms";
import {
  activeSeasonEntries,
  existingStaff,
  existingStaffKeys,
  insertStaff,
  openHub,
  setStaffPortrait,
} from "./hub";
import { main } from "./run";
import { openBucket, storePortrait } from "./storage";

/**
 * Mocked at the I/O boundary only — the real mapper runs, because what this
 * pins is the *sequence*: read the CMS, match against the active season, drop
 * what the Hub already holds, and write nothing at all on a dry run. It is the
 * one module nothing else checks, and it runs once, against production.
 */
vi.mock("./cms", async (importOriginal) => ({
  ...(await importOriginal<typeof CmsModule>()),
  fetchTeams: vi.fn(),
  downloadMedia: vi.fn(),
}));
vi.mock("./hub", () => ({
  openHub: vi.fn(),
  activeSeasonEntries: vi.fn(),
  existingStaff: vi.fn(),
  existingStaffKeys: vi.fn(),
  insertStaff: vi.fn(),
  setStaffPortrait: vi.fn(),
}));
vi.mock("./storage", () => ({
  openBucket: vi.fn(),
  storePortrait: vi.fn(),
}));

const db = {} as Database;
const end = vi.fn();

function team(slug: string, permanentId: number | null, names: string[]): CmsTeam {
  return {
    id: 1,
    name: slug,
    slug,
    apiTeamPermanentId: permanentId,
    trainers: names.map((name, index) => ({
      id: index + 1,
      person: { id: index + 1, name },
      licence: "B-Lizenz",
      email: `${index}@example.de`,
    })),
  };
}

describe("main", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(openHub).mockReturnValue({ db, pool: { end } } as unknown as ReturnType<typeof openHub>);
    vi.mocked(activeSeasonEntries).mockResolvedValue(new Map([[100, 7]]));
    vi.mocked(existingStaffKeys).mockResolvedValue(new Set());
    vi.mocked(insertStaff).mockResolvedValue(1);
    vi.mocked(fetchTeams).mockResolvedValue([team("damen-1", 100, ["Max Mustermann"])]);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    end.mockReset();
  });

  it("writes the planned rows and closes the pool", async () => {
    await main([]);

    expect(insertStaff).toHaveBeenCalledWith(db, [
      {
        teamEntryId: 7,
        firstName: "Max",
        lastName: "Mustermann",
        role: "trainer",
        phone: null,
        email: "0@example.de",
        licence: "B-Lizenz",
      },
    ]);
    expect(end).toHaveBeenCalled();
  });

  it("looks up existing staff only for the entries it touches", async () => {
    await main([]);

    expect(existingStaffKeys).toHaveBeenCalledWith(db, [7]);
  });

  it("writes nothing under --dry-run", async () => {
    await main(["--dry-run"]);

    expect(insertStaff).not.toHaveBeenCalled();
    expect(vi.mocked(console.log).mock.calls.flat().join("\n")).toContain("dry run");
    expect(end).toHaveBeenCalled();
  });

  it("skips a row the hub already holds", async () => {
    vi.mocked(existingStaffKeys).mockResolvedValue(new Set(["7|max|mustermann"]));

    await main([]);

    expect(insertStaff).toHaveBeenCalledWith(db, []);
  });

  it("reports a trainer it could not name", async () => {
    vi.mocked(fetchTeams).mockResolvedValue([
      { id: 1, name: "Damen 1", slug: "damen-1", apiTeamPermanentId: 100, trainers: [{ id: 3 }] },
    ]);

    await main([]);

    expect(vi.mocked(console.warn).mock.calls.flat().join("\n")).toContain("trainer 3 has no person");
  });

  it("closes the pool when the mapping throws", async () => {
    vi.mocked(fetchTeams).mockResolvedValue([team("damen-1", 999, ["Max Mustermann"])]);

    await expect(main([])).rejects.toThrow(/no team entry in the active season/);
    expect(end).toHaveBeenCalled();
  });

  it("defaults to the process arguments", async () => {
    const argv = process.argv;
    process.argv = ["node", "index.ts", "--dry-run"];
    try {
      await main();
    } finally {
      process.argv = argv;
    }

    expect(insertStaff).not.toHaveBeenCalled();
  });
});

describe("main --portraits", () => {
  const bucket = {} as ReturnType<typeof openBucket>;
  const staffRow = { id: 42, teamEntryId: 7, firstName: "Max", lastName: "Mustermann", photoFilename: null };

  function teamWithPortrait(image: CmsTrainer["image"]): CmsTeam {
    return {
      id: 1,
      name: "Damen 1",
      slug: "damen-1",
      apiTeamPermanentId: 100,
      trainers: [{ id: 1, person: { id: 10, name: "Max Mustermann" }, image }],
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CMS_URL", "https://cms.example.de");
    vi.mocked(openHub).mockReturnValue({ db, pool: { end } } as unknown as ReturnType<typeof openHub>);
    vi.mocked(openBucket).mockReturnValue(bucket);
    vi.mocked(activeSeasonEntries).mockResolvedValue(new Map([[100, 7]]));
    vi.mocked(existingStaff).mockResolvedValue([staffRow]);
    vi.mocked(fetchTeams).mockResolvedValue([
      teamWithPortrait({ id: 5, url: "/api/media/file/max.jpg", mimeType: "image/jpeg" }),
    ]);
    vi.mocked(downloadMedia).mockResolvedValue(Buffer.from("jpeg"));
    vi.mocked(storePortrait).mockResolvedValue("uuid.jpg");
    vi.mocked(setStaffPortrait).mockResolvedValue(undefined);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    end.mockReset();
  });

  it("downloads, stores and records each planned portrait, then closes the pool", async () => {
    await main(["--portraits"]);

    expect(downloadMedia).toHaveBeenCalledWith("/api/media/file/max.jpg");
    expect(storePortrait).toHaveBeenCalledWith(bucket, Buffer.from("jpeg"), "image/jpeg");
    expect(setStaffPortrait).toHaveBeenCalledWith(db, 42, "uuid.jpg");
    expect(insertStaff).not.toHaveBeenCalled();
    expect(end).toHaveBeenCalled();
  });

  it("looks up the staff of every active-season entry", async () => {
    await main(["--portraits"]);

    expect(existingStaff).toHaveBeenCalledWith(db, [7]);
  });

  it("lists each planned copy with its resolved source URL and writes nothing under --dry-run", async () => {
    await main(["--portraits", "--dry-run"]);

    const log = vi.mocked(console.log).mock.calls.flat().join("\n");
    expect(log).toContain("staff 42 (entry 7, Max Mustermann, image/jpeg) <- https://cms.example.de/api/media/file/max.jpg");
    expect(log).toContain("dry run: 1 portrait(s) would be copied");
    expect(downloadMedia).not.toHaveBeenCalled();
    expect(storePortrait).not.toHaveBeenCalled();
    expect(setStaffPortrait).not.toHaveBeenCalled();
    expect(end).toHaveBeenCalled();
  });

  it("reports a trainer without an image", async () => {
    vi.mocked(fetchTeams).mockResolvedValue([teamWithPortrait(null)]);

    await main(["--portraits"]);

    expect(vi.mocked(console.warn).mock.calls.flat().join("\n")).toContain("has no image");
    expect(storePortrait).not.toHaveBeenCalled();
  });

  it("leaves a row that already has a portrait alone and says so", async () => {
    vi.mocked(existingStaff).mockResolvedValue([{ ...staffRow, photoFilename: "kept.jpg" }]);

    await main(["--portraits"]);

    expect(storePortrait).not.toHaveBeenCalled();
    expect(vi.mocked(console.log).mock.calls.flat().join("\n")).toContain("1 already there");
  });

  it("checks the bucket configuration before reading the CMS", async () => {
    vi.mocked(openBucket).mockImplementation(() => {
      throw new Error("GCS_BUCKET_NAME is not set");
    });

    await expect(main(["--portraits"])).rejects.toThrow("GCS_BUCKET_NAME is not set");
    expect(fetchTeams).not.toHaveBeenCalled();
    expect(end).toHaveBeenCalled();
  });

  it("stops at the first copy that fails, leaving the rest for a rerun", async () => {
    vi.mocked(fetchTeams).mockResolvedValue([
      teamWithPortrait({ id: 5, url: "/api/media/file/max.jpg", mimeType: "image/jpeg" }),
      { ...teamWithPortrait({ id: 6, url: "/api/media/file/erika.jpg", mimeType: "image/jpeg" }), id: 2, slug: "herren-1", apiTeamPermanentId: 200 },
    ]);
    vi.mocked(activeSeasonEntries).mockResolvedValue(new Map([[100, 7], [200, 8]]));
    vi.mocked(existingStaff).mockResolvedValue([staffRow, { ...staffRow, id: 43, teamEntryId: 8 }]);
    vi.mocked(storePortrait).mockRejectedValueOnce(new Error("bucket unreachable"));

    await expect(main(["--portraits"])).rejects.toThrow("bucket unreachable");
    expect(setStaffPortrait).not.toHaveBeenCalled();
    expect(downloadMedia).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalled();
  });
});
