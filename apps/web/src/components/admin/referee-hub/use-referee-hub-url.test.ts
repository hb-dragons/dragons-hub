import { describe, expect, it } from "vitest";
import { parseHubUrl, buildHubUrl } from "./use-referee-hub-url";

describe("parseHubUrl", () => {
  it("returns Open Slots as the default tab when no params", () => {
    const state = parseHubUrl(new URLSearchParams(""));
    expect(state).toEqual({
      tab: "open-slots",
      gameId: null,
      refereeId: null,
      subtab: "profile",
      filters: {
        status: "open",
        league: [],
        dateFrom: null,
        dateTo: null,
        gameType: "both",
      },
      scope: "own",
      search: "",
      sort: "name",
    });
  });

  it("parses tab=referees with refId and subtab=history", () => {
    const state = parseHubUrl(
      new URLSearchParams("tab=referees&id=42&subtab=history"),
    );
    expect(state).toEqual({
      tab: "referees",
      gameId: null,
      refereeId: 42,
      subtab: "history",
      filters: {
        status: "open",
        league: [],
        dateFrom: null,
        dateTo: null,
        gameType: "both",
      },
      scope: "own",
      search: "",
      sort: "name",
    });
  });

  it("parses open-slots tab with game id", () => {
    const state = parseHubUrl(
      new URLSearchParams("tab=open-slots&game=4287"),
    );
    expect(state.tab).toBe("open-slots");
    expect(state.gameId).toBe(4287);
  });

  it("ignores non-numeric ids", () => {
    const state = parseHubUrl(new URLSearchParams("tab=referees&id=abc"));
    expect(state.refereeId).toBeNull();
  });

  it("clamps unknown tab to open-slots default", () => {
    const state = parseHubUrl(new URLSearchParams("tab=bogus"));
    expect(state.tab).toBe("open-slots");
  });

  it("clamps unknown subtab to profile default", () => {
    const state = parseHubUrl(new URLSearchParams("tab=referees&subtab=x"));
    expect(state.subtab).toBe("profile");
  });
});

describe("buildHubUrl", () => {
  it("omits default tab in the URL", () => {
    expect(
      buildHubUrl({
        tab: "open-slots",
        gameId: null,
        refereeId: null,
        subtab: "profile",
        filters: { status: "open", league: [], dateFrom: null, dateTo: null, gameType: "both" },
        scope: "own",
        search: "",
        sort: "name",
      }),
    ).toBe("");
  });

  it("includes tab and ref id", () => {
    expect(
      buildHubUrl({
        tab: "referees",
        gameId: null,
        refereeId: 42,
        subtab: "profile",
        filters: { status: "open", league: [], dateFrom: null, dateTo: null, gameType: "both" },
        scope: "own",
        search: "",
        sort: "name",
      }),
    ).toBe("tab=referees&id=42");
  });

  it("includes game id when on open-slots", () => {
    expect(
      buildHubUrl({
        tab: "open-slots",
        gameId: 4287,
        refereeId: null,
        subtab: "profile",
        filters: { status: "open", league: [], dateFrom: null, dateTo: null, gameType: "both" },
        scope: "own",
        search: "",
        sort: "name",
      }),
    ).toBe("game=4287");
  });

  it("includes subtab when not profile", () => {
    expect(
      buildHubUrl({
        tab: "referees",
        gameId: null,
        refereeId: 42,
        subtab: "history",
        filters: { status: "open", league: [], dateFrom: null, dateTo: null, gameType: "both" },
        scope: "own",
        search: "",
        sort: "name",
      }),
    ).toBe("tab=referees&id=42&subtab=history");
  });
});

describe("hub URL state — open-slots filters", () => {
  it("parses status, league, dateFrom, dateTo, gameType from URL", () => {
    const params = new URLSearchParams(
      "tab=open-slots&status=open&league=OL,BL&dateFrom=2026-05-18&dateTo=2026-06-01&gameType=home",
    );
    const state = parseHubUrl(params);
    expect(state.filters).toEqual({
      status: "open",
      league: ["OL", "BL"],
      dateFrom: "2026-05-18",
      dateTo: "2026-06-01",
      gameType: "home",
    });
  });

  it("defaults to status=open, gameType=both, no league filter", () => {
    const params = new URLSearchParams("tab=open-slots");
    const state = parseHubUrl(params);
    expect(state.filters.status).toBe("open");
    expect(state.filters.gameType).toBe("both");
    expect(state.filters.league).toEqual([]);
  });

  it("omits default filter values from rebuilt URL", () => {
    const url = buildHubUrl({
      tab: "open-slots",
      gameId: null,
      refereeId: null,
      subtab: "profile",
      filters: { status: "open", league: [], dateFrom: null, dateTo: null, gameType: "both" },
      scope: "own",
      search: "",
      sort: "name",
    });
    expect(url).toBe("");
  });
});

describe("hub URL state — search and sort", () => {
  it("parses search and sort from query, with defaults", () => {
    expect(parseHubUrl(new URLSearchParams("")).search).toBe("");
    expect(parseHubUrl(new URLSearchParams("")).sort).toBe("name");
    expect(parseHubUrl(new URLSearchParams("search=mei&sort=workloadDesc")).search).toBe("mei");
    expect(parseHubUrl(new URLSearchParams("search=mei&sort=workloadDesc")).sort).toBe("workloadDesc");
  });

  it("ignores invalid sort and falls back to name", () => {
    expect(parseHubUrl(new URLSearchParams("sort=bogus")).sort).toBe("name");
  });

  it("serializes only non-default search/sort under referees tab", () => {
    const filters = { status: "open" as const, league: [], dateFrom: null, dateTo: null, gameType: "both" as const };
    const qs = buildHubUrl({
      tab: "referees",
      gameId: null,
      refereeId: null,
      subtab: "profile",
      filters,
      scope: "own",
      search: "mei",
      sort: "workloadDesc",
    });
    expect(qs).toContain("search=mei");
    expect(qs).toContain("sort=workloadDesc");
  });
});
