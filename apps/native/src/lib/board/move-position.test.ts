import { describe, expect, it } from "vitest";

import { moveTargetPosition } from "@/lib/board/move-position";

describe("moveTargetPosition", () => {
  it("puts a task at index 0 for top placement", () => {
    expect(
      moveTargetPosition({ placement: "top", columnTaskCount: 5, movingWithinColumn: false }),
    ).toBe(0);
  });

  it("appends past the last task when moving into another column", () => {
    expect(
      moveTargetPosition({ placement: "bottom", columnTaskCount: 3, movingWithinColumn: false }),
    ).toBe(3);
  });

  // The task is already counted in its own column, so the last free index is
  // one lower — asking for `count` would insert past the end.
  it("excludes the task itself when moving within its own column", () => {
    expect(
      moveTargetPosition({ placement: "bottom", columnTaskCount: 3, movingWithinColumn: true }),
    ).toBe(2);
  });

  it("never returns a negative position for the only task in a column", () => {
    expect(
      moveTargetPosition({ placement: "bottom", columnTaskCount: 1, movingWithinColumn: true }),
    ).toBe(0);
  });

  it("handles an empty target column", () => {
    expect(
      moveTargetPosition({ placement: "bottom", columnTaskCount: 0, movingWithinColumn: false }),
    ).toBe(0);
  });
});
