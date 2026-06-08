import { describe, expect, it } from "vitest";
import { leagueNumbersSchema, leagueOwnClubRefsSchema } from "./league";

describe("leagueNumbersSchema", () => {
  it("accepts a valid array of positive integers", () => {
    const result = leagueNumbersSchema.parse({ leagueNumbers: [4102, 4105] });
    expect(result).toEqual({ leagueNumbers: [4102, 4105] });
  });

  it("accepts an empty array", () => {
    const result = leagueNumbersSchema.parse({ leagueNumbers: [] });
    expect(result).toEqual({ leagueNumbers: [] });
  });

  it("accepts a single element array", () => {
    const result = leagueNumbersSchema.parse({ leagueNumbers: [1] });
    expect(result).toEqual({ leagueNumbers: [1] });
  });

  it("rejects missing leagueNumbers field", () => {
    expect(() => leagueNumbersSchema.parse({})).toThrow();
  });

  it("rejects non-array leagueNumbers", () => {
    expect(() => leagueNumbersSchema.parse({ leagueNumbers: "4102" })).toThrow();
  });

  it("rejects negative numbers in array", () => {
    expect(() => leagueNumbersSchema.parse({ leagueNumbers: [-1] })).toThrow();
  });

  it("rejects zero in array", () => {
    expect(() => leagueNumbersSchema.parse({ leagueNumbers: [0] })).toThrow();
  });

  it("rejects non-integer numbers in array", () => {
    expect(() => leagueNumbersSchema.parse({ leagueNumbers: [4102.5] })).toThrow();
  });

  it("rejects string values in array", () => {
    expect(() => leagueNumbersSchema.parse({ leagueNumbers: ["4102"] })).toThrow();
  });
});

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
