import { describe, expect, it } from "vitest";
import { STANDINGS_SHORTCUT_ROUTE, TAB_CONFIG } from "@/lib/nav/tabs";

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
