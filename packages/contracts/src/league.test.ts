import { describe, expect, it } from "vitest";
import { leagueOwnClubRefsSchema, leagueIdParamSchema } from "./league";

describe("leagueOwnClubRefsSchema", () => {
  it("accepts true", () => {
    const result = leagueOwnClubRefsSchema.parse({ ownClubRefs: true });
    expect(result).toEqual({ ownClubRefs: true });
  });

  it("accepts false", () => {
    const result = leagueOwnClubRefsSchema.parse({ ownClubRefs: false });
    expect(result).toEqual({ ownClubRefs: false });
  });

  it("rejects missing ownClubRefs field", () => {
    expect(() => leagueOwnClubRefsSchema.parse({})).toThrow();
  });

  it("rejects string 'true'", () => {
    expect(() => leagueOwnClubRefsSchema.parse({ ownClubRefs: "true" })).toThrow();
  });

  it("rejects string 'yes'", () => {
    expect(() => leagueOwnClubRefsSchema.parse({ ownClubRefs: "yes" })).toThrow();
  });

  it("rejects number 1", () => {
    expect(() => leagueOwnClubRefsSchema.parse({ ownClubRefs: 1 })).toThrow();
  });

  it("rejects null", () => {
    expect(() => leagueOwnClubRefsSchema.parse({ ownClubRefs: null })).toThrow();
  });
});

describe("leagueIdParamSchema", () => {
  it("coerces a numeric string to a positive integer", () => {
    expect(leagueIdParamSchema.parse({ id: "9" })).toEqual({ id: 9 });
  });

  it("rejects a non-numeric string", () => {
    expect(() => leagueIdParamSchema.parse({ id: "abc" })).toThrow();
  });

  it("rejects zero", () => {
    expect(() => leagueIdParamSchema.parse({ id: "0" })).toThrow();
  });

  it("rejects a negative value", () => {
    expect(() => leagueIdParamSchema.parse({ id: "-1" })).toThrow();
  });
});
