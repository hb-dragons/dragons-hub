import { describe, expect, it } from "vitest";
import {
  STANDINGS_SHORTCUT_ROUTE,
  TAB_BAR_MINIMIZE_BEHAVIOR,
  TAB_CONFIG,
} from "@/lib/nav/tabs";

describe("TAB_CONFIG", () => {
  it("defines a config for every tab id with a route name and label key", () => {
    for (const [id, cfg] of Object.entries(TAB_CONFIG)) {
      expect(cfg.name, `${id}.name`).toBeTruthy();
      expect(cfg.labelKey, `${id}.labelKey`).toMatch(/^tabs\./);
    }
  });

  it("maps home to the index route", () => {
    expect(TAB_CONFIG.home.name).toBe("index");
  });

  // #221: the tab bar was already the app's one SF Symbol surface, and it is
  // now the icon language's flagship. `NativeTabs.Trigger.Icon` types the
  // *selected* symbol as required and the default one as optional, so a tab
  // declared with only a selected symbol compiles and then draws nothing while
  // the user is on another tab. The Material name is the Android tier (ADR
  // 0001); without it that platform's tab has no icon at all.
  it("gives every tab both SF Symbol states and a Material fallback", () => {
    for (const [id, cfg] of Object.entries(TAB_CONFIG)) {
      expect(cfg.sf.default, `${id}.sf.default`).toBeTruthy();
      expect(cfg.sf.selected, `${id}.sf.selected`).toBeTruthy();
      expect(cfg.md, `${id}.md`).toBeTruthy();
    }
  });

  it("draws each tab with its own icon", () => {
    const selected = Object.values(TAB_CONFIG).map((cfg) => cfg.sf.selected);
    expect(new Set(selected).size, "two tabs share a symbol").toBe(selected.length);
  });
});

describe("TAB_BAR_MINIMIZE_BEHAVIOR", () => {
  it("minimizes the tab bar while the user reads further down", () => {
    // The decision, per tab root: Schedule, Standings, Officiating and Teams
    // all scroll well past a screenful, and Today's item list can. Home is the
    // only root that rarely scrolls, and giving up tab-bar chrome there costs
    // nothing. UIKit exposes the behaviour on the tab bar controller, not per
    // tab, so one value covers all six either way.
    expect(TAB_BAR_MINIMIZE_BEHAVIOR).toBe("onScrollDown");
  });
});

describe("STANDINGS_SHORTCUT_ROUTE", () => {
  it("is an absolute in-app path", () => {
    expect(STANDINGS_SHORTCUT_ROUTE.startsWith("/")).toBe(true);
  });

  it("does not point at the standings tab route", () => {
    // Native tabs mount only the routes whose triggers render, so the Staff
    // users who need the shortcut are exactly the ones for whom the tab route
    // does not exist.
    expect(STANDINGS_SHORTCUT_ROUTE).not.toBe(`/${TAB_CONFIG.standings.name}`);
  });
});
