import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@dragons/db";

import { fetchTeams, type CmsTeam } from "./cms";
import type * as CmsModule from "./cms";
import { activeSeasonEntries, existingStaffKeys, insertStaff, openHub } from "./hub";
import { main } from "./run";

/**
 * Mocked at the I/O boundary only — the real mapper runs, because what this
 * pins is the *sequence*: read the CMS, match against the active season, drop
 * what the Hub already holds, and write nothing at all on a dry run. It is the
 * one module nothing else checks, and it runs once, against production.
 */
vi.mock("./cms", async (importOriginal) => ({
  ...(await importOriginal<typeof CmsModule>()),
  fetchTeams: vi.fn(),
}));
vi.mock("./hub", () => ({
  openHub: vi.fn(),
  activeSeasonEntries: vi.fn(),
  existingStaffKeys: vi.fn(),
  insertStaff: vi.fn(),
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
