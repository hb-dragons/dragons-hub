import { describe, expect, it } from "vitest";
import { TAB_CONFIG } from "@/lib/nav/tabs";

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
