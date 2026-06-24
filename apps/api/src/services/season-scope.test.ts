import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mock setup ---

vi.mock("./admin/season.service", () => ({
  getActiveSeasonId: vi.fn(),
}));

// --- Imports (after mocks) ---

import { withActiveSeason } from "./season-scope";
import { getActiveSeasonId } from "./admin/season.service";

const mockGetActiveSeasonId = vi.mocked(getActiveSeasonId);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("withActiveSeason", () => {
  it("calls fn with the active season id when one exists", async () => {
    mockGetActiveSeasonId.mockResolvedValue(42);

    const result = await withActiveSeason(async (seasonId) => `season-${seasonId}`, "empty");

    expect(result).toBe("season-42");
  });

  it("returns empty value when there is no active season", async () => {
    mockGetActiveSeasonId.mockResolvedValue(null);

    const result = await withActiveSeason(async (_seasonId) => ["should not be returned"], [] as string[]);

    expect(result).toEqual([]);
  });
});
