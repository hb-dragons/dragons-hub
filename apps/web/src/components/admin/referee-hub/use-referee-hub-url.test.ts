import { describe, expect, it, vi } from "vitest";
import { parseHubUrl, buildHubUrl } from "./use-referee-hub-url";

describe("parseHubUrl", () => {
  it("returns Open Slots as the default tab when no params", () => {
    const state = parseHubUrl(new URLSearchParams(""));
    expect(state).toEqual({
      tab: "open-slots",
      gameId: null,
      refereeId: null,
      subtab: "profile",
      range: "30d",
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
      range: "30d",
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

  it("clamps unknown range to 30d", () => {
    const state = parseHubUrl(new URLSearchParams("range=forever"));
    expect(state.range).toBe("30d");
  });
});

describe("buildHubUrl", () => {
  it("omits default tab in the URL", () => {
    expect(buildHubUrl({ tab: "open-slots", gameId: null, refereeId: null, subtab: "profile", range: "30d" }))
      .toBe("");
  });

  it("includes tab and ref id", () => {
    expect(buildHubUrl({ tab: "referees", gameId: null, refereeId: 42, subtab: "profile", range: "30d" }))
      .toBe("tab=referees&id=42");
  });

  it("includes game id when on open-slots", () => {
    expect(buildHubUrl({ tab: "open-slots", gameId: 4287, refereeId: null, subtab: "profile", range: "30d" }))
      .toBe("game=4287");
  });

  it("includes subtab when not profile", () => {
    expect(buildHubUrl({ tab: "referees", gameId: null, refereeId: 42, subtab: "history", range: "30d" }))
      .toBe("tab=referees&id=42&subtab=history");
  });

  it("includes range when not 30d", () => {
    expect(buildHubUrl({ tab: "open-slots", gameId: null, refereeId: null, subtab: "profile", range: "season" }))
      .toBe("range=season");
  });
});
