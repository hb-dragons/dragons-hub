import { describe, expect, it } from "vitest";
import { userRefereeLinkBodySchema } from "./user";

describe("userRefereeLinkBodySchema", () => {
  it("accepts a positive integer refereeId", () => {
    const result = userRefereeLinkBodySchema.parse({ refereeId: 42 });
    expect(result).toEqual({ refereeId: 42 });
  });

  it("accepts refereeId: null (unlink)", () => {
    const result = userRefereeLinkBodySchema.parse({ refereeId: null });
    expect(result).toEqual({ refereeId: null });
  });

  it("rejects missing refereeId field", () => {
    expect(() => userRefereeLinkBodySchema.parse({})).toThrow();
  });

  it("rejects zero", () => {
    expect(() => userRefereeLinkBodySchema.parse({ refereeId: 0 })).toThrow();
  });

  it("rejects negative integer", () => {
    expect(() => userRefereeLinkBodySchema.parse({ refereeId: -1 })).toThrow();
  });

  it("rejects non-integer (float)", () => {
    expect(() => userRefereeLinkBodySchema.parse({ refereeId: 1.5 })).toThrow();
  });

  it("rejects string", () => {
    expect(() => userRefereeLinkBodySchema.parse({ refereeId: "42" })).toThrow();
  });
});
