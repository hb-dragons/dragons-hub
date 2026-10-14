import { describe, expect, it } from "vitest";
import { screenContentPadding } from "@/lib/ui/screen-padding";

const spacing = { lg: 16, xl: 24 };

describe("screenContentPadding", () => {
  it("ends a scrolling screen's content with breathing room", () => {
    expect(screenContentPadding({ scroll: true, spacing })).toEqual({
      paddingHorizontal: 16,
      paddingBottom: 24,
    });
  });

  it("pads only the sides of a non-scrolling screen", () => {
    // The child is a list with its own scroll view (and its own end padding)
    // or a centred full-height state; a bottom padding on the wrapper clips
    // the list above the tab bar instead of adding room — a blank band on
    // Android, where tab content ends at the opaque bar's top edge.
    expect(screenContentPadding({ scroll: false, spacing })).toEqual({
      paddingHorizontal: 16,
    });
  });
});
