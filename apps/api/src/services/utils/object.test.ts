import { describe, expect, it } from "vitest";
import { pickDefined } from "./object";

describe("pickDefined", () => {
  it("includes only keys whose value is not undefined", () => {
    const out = pickDefined(
      { a: 1, b: undefined, c: "x" },
      ["a", "b", "c"],
    );
    expect(out).toEqual({ a: 1, c: "x" });
    expect("b" in out).toBe(false);
  });

  it("preserves null (only undefined is dropped)", () => {
    const out = pickDefined({ a: null, b: 2 }, ["a", "b"]);
    expect(out).toEqual({ a: null, b: 2 });
  });

  it("only considers the listed keys", () => {
    const out = pickDefined({ a: 1, b: 2, c: 3 }, ["a"]);
    expect(out).toEqual({ a: 1 });
  });

  it("returns an empty object when every listed value is undefined", () => {
    const out = pickDefined({ a: undefined, b: undefined }, ["a", "b"]);
    expect(out).toEqual({});
  });
});
