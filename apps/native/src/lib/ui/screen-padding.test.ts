import { describe, expect, it } from "vitest";
import { screenContentPadding } from "@/lib/ui/screen-padding";

const spacing = { lg: 16, xl: 24 };

describe("screenContentPadding", () => {
  it("ends a scrolling screen's content with breathing room", () => {
    expect(screenContentPadding(spacing)).toEqual({
      paddingHorizontal: 16,
      paddingBottom: 24,
    });
  });
});
