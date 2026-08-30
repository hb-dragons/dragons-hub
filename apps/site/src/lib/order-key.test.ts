import { describe, expect, it } from "vitest";

import { compareOrderKeys } from "./order-key";

describe("compareOrderKeys", () => {
  it("sorts fractional-index keys by code unit, digits before letters", () => {
    const keys = ["aA", "a1", "Zz", "a0", "a9"];
    expect([...keys].sort(compareOrderKeys)).toEqual(["Zz", "a0", "a1", "a9", "aA"]);
  });

  it("orders midpoint keys between their neighbours", () => {
    // generateKeyBetween("a0", "a1") yields a longer key like "a0V".
    expect([...["a1", "a0V", "a0"]].sort(compareOrderKeys)).toEqual(["a0", "a0V", "a1"]);
  });

  it("returns 0 for equal keys", () => {
    expect(compareOrderKeys("a5", "a5")).toBe(0);
  });
});
