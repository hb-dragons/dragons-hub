import { describe, expect, it } from "vitest";
import { parseResult } from "./parse-result";

describe("parseResult", () => {
  it("parses a normal result", () => {
    expect(parseResult("63:61")).toEqual({ home: 63, guest: 61 });
  });

  it("keeps a zero home score as 0, not null (forfeit)", () => {
    expect(parseResult("0:20")).toEqual({ home: 0, guest: 20 });
  });

  it("keeps a zero guest score as 0, not null (forfeit)", () => {
    expect(parseResult("20:0")).toEqual({ home: 20, guest: 0 });
  });

  it("keeps a 0:0 result as zeroes", () => {
    expect(parseResult("0:0")).toEqual({ home: 0, guest: 0 });
  });

  it("returns nulls for an empty or missing result", () => {
    expect(parseResult(null)).toEqual({ home: null, guest: null });
    expect(parseResult("")).toEqual({ home: null, guest: null });
  });

  it("returns nulls when the string is not a two-part score", () => {
    expect(parseResult("63")).toEqual({ home: null, guest: null });
    expect(parseResult("1:2:3")).toEqual({ home: null, guest: null });
  });

  it("returns null for a side that is not a number", () => {
    expect(parseResult("abc:20")).toEqual({ home: null, guest: 20 });
    expect(parseResult("20:")).toEqual({ home: 20, guest: null });
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseResult(" 0 : 20 ")).toEqual({ home: 0, guest: 20 });
  });

  it("rejects trailing garbage rather than silently truncating", () => {
    // parseInt("12abc") === 12; a score that is not fully numeric is not a score.
    expect(parseResult("12abc:20")).toEqual({ home: null, guest: 20 });
  });

  it("rejects non-integer scores", () => {
    expect(parseResult("1.5:20")).toEqual({ home: null, guest: 20 });
    expect(parseResult("Infinity:20")).toEqual({ home: null, guest: 20 });
  });
});
