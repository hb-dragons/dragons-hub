import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  OPEN_GAMES_PAGE_SIZE,
  isOpenGamesListKey,
  openGamesPagesKey,
  openGamesQueryOpts,
} from "./open-games-query";

const TODAY = "2026-10-08";

describe("openGamesQueryOpts", () => {
  it("starts the default list today, not at the start of the season", () => {
    expect(openGamesQueryOpts(DEFAULT_FILTERS, TODAY)).toEqual({
      status: "active",
      slotStatus: "open",
      league: [],
      dateFrom: TODAY,
      dateTo: undefined,
      gameType: "both",
      search: undefined,
      limit: OPEN_GAMES_PAGE_SIZE,
      offset: 0,
    });
  });

  it("keeps an explicit range, past dates included", () => {
    const opts = openGamesQueryOpts(
      { ...DEFAULT_FILTERS, dateFrom: "2026-06-01", dateTo: "2026-06-30" },
      TODAY,
    );
    expect(opts.dateFrom).toBe("2026-06-01");
    expect(opts.dateTo).toBe("2026-06-30");
  });

  it("sends every status explicitly, any included", () => {
    expect(openGamesQueryOpts({ ...DEFAULT_FILTERS, status: "any" }, TODAY).slotStatus).toBe("any");
    expect(openGamesQueryOpts({ ...DEFAULT_FILTERS, status: "offered" }, TODAY).slotStatus).toBe("offered");
  });

  it("drops a search shorter than three characters", () => {
    expect(openGamesQueryOpts({ ...DEFAULT_FILTERS, search: "dr" }, TODAY).search).toBeUndefined();
    expect(openGamesQueryOpts({ ...DEFAULT_FILTERS, search: "dra" }, TODAY).search).toBe("dra");
  });

  it("offsets by whole pages", () => {
    expect(openGamesQueryOpts(DEFAULT_FILTERS, TODAY, 2).offset).toBe(2 * OPEN_GAMES_PAGE_SIZE);
  });
});

describe("openGamesPagesKey", () => {
  const first = "/referee/games?status=active&limit=200&offset=0";

  it("leaves the first page's key alone, so the server prefetch lands", () => {
    expect(openGamesPagesKey(first, 1)).toBe(first);
  });

  it("extends the key for more pages and stays inside the bulk revalidation", () => {
    const key = openGamesPagesKey(first, 3);
    expect(key).not.toBe(first);
    expect(key).not.toBe(openGamesPagesKey(first, 2));
    expect(isOpenGamesListKey(key)).toBe(true);
  });
});
