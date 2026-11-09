import { describe, expect, it } from "vitest";
import { isTitleRevealed } from "./title-reveal";

// iOS: the transparent header floats over the list, so the list starts
// scrolled to minus the header's height and content y = 0 sits just below it.
const IOS_HEADER = 116;
// The team name block ends 80pt into the list content.
const NAME_BOTTOM = 80;

describe("isTitleRevealed", () => {
  it("shows no bar title while the in-content name is visible", () => {
    expect(isTitleRevealed({ offsetY: -IOS_HEADER, coveredTop: IOS_HEADER, nameBottom: NAME_BOTTOM })).toBe(false);
    // Scrolled 79pt: one point of the name still shows below the bar.
    expect(isTitleRevealed({ offsetY: 79 - IOS_HEADER, coveredTop: IOS_HEADER, nameBottom: NAME_BOTTOM })).toBe(false);
  });

  it("shows the bar title once the name has scrolled fully under the bar", () => {
    expect(isTitleRevealed({ offsetY: NAME_BOTTOM - IOS_HEADER, coveredTop: IOS_HEADER, nameBottom: NAME_BOTTOM })).toBe(true);
    expect(isTitleRevealed({ offsetY: 300, coveredTop: IOS_HEADER, nameBottom: NAME_BOTTOM })).toBe(true);
  });

  it("works for an opaque bar that covers nothing (Android)", () => {
    expect(isTitleRevealed({ offsetY: 0, coveredTop: 0, nameBottom: NAME_BOTTOM })).toBe(false);
    expect(isTitleRevealed({ offsetY: 79, coveredTop: 0, nameBottom: NAME_BOTTOM })).toBe(false);
    expect(isTitleRevealed({ offsetY: 80, coveredTop: 0, nameBottom: NAME_BOTTOM })).toBe(true);
  });

  it("stays hidden until the name block has been measured", () => {
    expect(isTitleRevealed({ offsetY: 500, coveredTop: 0, nameBottom: null })).toBe(false);
  });
});
