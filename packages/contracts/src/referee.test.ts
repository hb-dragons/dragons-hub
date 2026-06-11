import { describe, expect, it } from "vitest";
import {
  refereeListQuerySchema,
  refereeVisibilityBodySchema,
  refereeApiMatchParamSchema,
  refereeMatchIdParamSchema,
  refereeGameIdParamSchema,
} from "./referee";

describe("refereeListQuerySchema", () => {
  it("parses minimal input with defaults", () => {
    const result = refereeListQuerySchema.parse({});
    expect(result).toEqual({ limit: 50, offset: 0, scope: "own", sort: "name" });
  });

  it("coerces string limit and offset", () => {
    const result = refereeListQuerySchema.parse({ limit: "10", offset: "5" });
    expect(result).toMatchObject({ limit: 10, offset: 5 });
  });

  it("accepts scope=all", () => {
    const result = refereeListQuerySchema.parse({ scope: "all" });
    expect(result).toMatchObject({ scope: "all" });
  });

  it("accepts scope=own explicitly", () => {
    const result = refereeListQuerySchema.parse({ scope: "own" });
    expect(result).toMatchObject({ scope: "own" });
  });

  it("accepts sort=workloadAsc", () => {
    const result = refereeListQuerySchema.parse({ sort: "workloadAsc" });
    expect(result).toMatchObject({ sort: "workloadAsc" });
  });

  it("accepts sort=workloadDesc", () => {
    const result = refereeListQuerySchema.parse({ sort: "workloadDesc" });
    expect(result).toMatchObject({ sort: "workloadDesc" });
  });

  it("accepts optional search string", () => {
    const result = refereeListQuerySchema.parse({ search: "Mueller" });
    expect(result).toMatchObject({ search: "Mueller" });
  });

  it("accepts limit at max boundary", () => {
    const result = refereeListQuerySchema.parse({ limit: "1000" });
    expect(result).toMatchObject({ limit: 1000 });
  });

  it("accepts limit at min boundary", () => {
    const result = refereeListQuerySchema.parse({ limit: "1" });
    expect(result).toMatchObject({ limit: 1 });
  });

  it("accepts offset at zero", () => {
    const result = refereeListQuerySchema.parse({ offset: "0" });
    expect(result).toMatchObject({ offset: 0 });
  });

  it("rejects invalid scope value", () => {
    expect(() => refereeListQuerySchema.parse({ scope: "mine" })).toThrow();
  });

  it("rejects invalid sort value", () => {
    expect(() => refereeListQuerySchema.parse({ sort: "banana" })).toThrow();
  });

  it("rejects limit below 1", () => {
    expect(() => refereeListQuerySchema.parse({ limit: "0" })).toThrow();
  });

  it("rejects limit above 1000", () => {
    expect(() => refereeListQuerySchema.parse({ limit: "1001" })).toThrow();
  });

  it("rejects negative offset", () => {
    expect(() => refereeListQuerySchema.parse({ offset: "-1" })).toThrow();
  });

  it("rejects non-numeric limit string", () => {
    expect(() => refereeListQuerySchema.parse({ limit: "abc" })).toThrow();
  });

  it("rejects empty search string", () => {
    expect(() => refereeListQuerySchema.parse({ search: "" })).toThrow();
  });

  it("omits search when not provided", () => {
    const result = refereeListQuerySchema.parse({});
    expect(result.search).toBeUndefined();
  });
});

describe("refereeVisibilityBodySchema", () => {
  it("accepts all boolean fields", () => {
    const result = refereeVisibilityBodySchema.parse({
      allowAllHomeGames: true,
      allowAwayGames: false,
      isOwnClub: true,
    });
    expect(result).toEqual({ allowAllHomeGames: true, allowAwayGames: false, isOwnClub: true });
  });

  it("accepts all fields as false", () => {
    const result = refereeVisibilityBodySchema.parse({
      allowAllHomeGames: false,
      allowAwayGames: false,
      isOwnClub: false,
    });
    expect(result).toEqual({ allowAllHomeGames: false, allowAwayGames: false, isOwnClub: false });
  });

  it("rejects string instead of boolean for allowAllHomeGames", () => {
    expect(() =>
      refereeVisibilityBodySchema.parse({
        allowAllHomeGames: "yes",
        allowAwayGames: false,
        isOwnClub: false,
      }),
    ).toThrow();
  });

  it("rejects string instead of boolean for allowAwayGames", () => {
    expect(() =>
      refereeVisibilityBodySchema.parse({
        allowAllHomeGames: true,
        allowAwayGames: "no",
        isOwnClub: false,
      }),
    ).toThrow();
  });

  it("rejects string instead of boolean for isOwnClub", () => {
    expect(() =>
      refereeVisibilityBodySchema.parse({
        allowAllHomeGames: true,
        allowAwayGames: false,
        isOwnClub: "true",
      }),
    ).toThrow();
  });

  it("rejects missing allowAllHomeGames", () => {
    expect(() =>
      refereeVisibilityBodySchema.parse({
        allowAwayGames: false,
        isOwnClub: false,
      }),
    ).toThrow();
  });

  it("rejects missing allowAwayGames", () => {
    expect(() =>
      refereeVisibilityBodySchema.parse({
        allowAllHomeGames: true,
        isOwnClub: false,
      }),
    ).toThrow();
  });

  it("rejects missing isOwnClub", () => {
    expect(() =>
      refereeVisibilityBodySchema.parse({
        allowAllHomeGames: true,
        allowAwayGames: false,
      }),
    ).toThrow();
  });

  it("rejects empty object", () => {
    expect(() => refereeVisibilityBodySchema.parse({})).toThrow();
  });

  it("rejects null for a boolean field", () => {
    expect(() =>
      refereeVisibilityBodySchema.parse({
        allowAllHomeGames: null,
        allowAwayGames: false,
        isOwnClub: false,
      }),
    ).toThrow();
  });
});

describe("refereeApiMatchParamSchema", () => {
  it("coerces a numeric string to a positive integer", () => {
    expect(refereeApiMatchParamSchema.parse({ apiMatchId: "42" })).toEqual({ apiMatchId: 42 });
  });

  it("rejects a non-numeric string", () => {
    expect(() => refereeApiMatchParamSchema.parse({ apiMatchId: "abc" })).toThrow();
  });

  it("rejects zero", () => {
    expect(() => refereeApiMatchParamSchema.parse({ apiMatchId: "0" })).toThrow();
  });

  it("rejects a negative value", () => {
    expect(() => refereeApiMatchParamSchema.parse({ apiMatchId: "-1" })).toThrow();
  });
});

describe("refereeMatchIdParamSchema", () => {
  it("coerces a numeric string to a positive integer", () => {
    expect(refereeMatchIdParamSchema.parse({ matchId: "7" })).toEqual({ matchId: 7 });
  });

  it("rejects a non-numeric string", () => {
    expect(() => refereeMatchIdParamSchema.parse({ matchId: "x" })).toThrow();
  });

  it("rejects zero", () => {
    expect(() => refereeMatchIdParamSchema.parse({ matchId: "0" })).toThrow();
  });
});

describe("refereeGameIdParamSchema", () => {
  it("coerces a numeric string to a positive integer", () => {
    expect(refereeGameIdParamSchema.parse({ id: "13" })).toEqual({ id: 13 });
  });

  it("rejects a non-numeric string", () => {
    expect(() => refereeGameIdParamSchema.parse({ id: "nope" })).toThrow();
  });

  it("rejects a negative value", () => {
    expect(() => refereeGameIdParamSchema.parse({ id: "-5" })).toThrow();
  });
});
