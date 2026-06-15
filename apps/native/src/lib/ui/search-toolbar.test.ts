import { describe, expect, it } from "vitest";
import { bottomSearchToolbarClearance } from "@/lib/ui/search-toolbar";

describe("bottomSearchToolbarClearance", () => {
  it("reserves clearance on iPhone, where iOS 26 docks the search bar in a bottom toolbar", () => {
    expect(bottomSearchToolbarClearance({ os: "ios", isPad: false })).toBeGreaterThan(0);
  });

  it("is zero on iPad — the integrated search bar stays in the navigation bar", () => {
    expect(bottomSearchToolbarClearance({ os: "ios", isPad: true })).toBe(0);
  });

  it("is zero on Android — no bottom search toolbar exists", () => {
    expect(bottomSearchToolbarClearance({ os: "android", isPad: false })).toBe(0);
  });
});
