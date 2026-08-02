import { describe, expect, it } from "vitest";

import { resolveRefs, vorstandClipDirection } from "./page-blocks";

describe("resolveRefs", () => {
  const entries = [
    { id: 1, name: "eins" },
    { id: 2, name: "zwei" },
    { id: 3, name: "drei" },
  ];

  it("returns full entries in block order", () => {
    expect(resolveRefs([{ id: 3 }, { id: 1 }], entries)).toEqual([
      { id: 3, name: "drei" },
      { id: 1, name: "eins" },
    ]);
  });

  it("drops refs without a matching entry", () => {
    expect(resolveRefs([{ id: 9 }, { id: 2 }], entries)).toEqual([{ id: 2, name: "zwei" }]);
  });

  it("returns nothing for nullish refs", () => {
    expect(resolveRefs(null, entries)).toEqual([]);
    expect(resolveRefs(undefined, entries)).toEqual([]);
  });
});

describe("vorstandClipDirection", () => {
  it("clips the first card right and the last card left", () => {
    expect(vorstandClipDirection(0, 3)).toBe("right");
    expect(vorstandClipDirection(2, 3)).toBe("left");
  });

  it("clips middle cards on both sides", () => {
    expect(vorstandClipDirection(1, 3)).toBe("both");
  });

  it("clips a lone card right, like the legacy ternary", () => {
    expect(vorstandClipDirection(0, 1)).toBe("right");
  });
});
