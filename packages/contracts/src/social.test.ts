import { describe, expect, it } from "vitest";
import {
  socialMatchesQuerySchema,
  socialGenerateBodySchema,
  socialIdParamSchema,
} from "./social";

describe("socialMatchesQuerySchema", () => {
  it("parses valid preview query", () => {
    const result = socialMatchesQuerySchema.parse({ type: "preview", week: "10", year: "2026" });
    expect(result).toEqual({ type: "preview", week: 10, year: 2026 });
  });

  it("parses valid results query", () => {
    const result = socialMatchesQuerySchema.parse({ type: "results", week: "1", year: "2025" });
    expect(result).toEqual({ type: "results", week: 1, year: 2025 });
  });

  it("coerces string week and year to numbers", () => {
    const result = socialMatchesQuerySchema.parse({ type: "preview", week: "53", year: "2100" });
    expect(result).toMatchObject({ week: 53, year: 2100 });
  });

  it("accepts numeric week and year directly", () => {
    const result = socialMatchesQuerySchema.parse({ type: "results", week: 20, year: 2024 });
    expect(result).toMatchObject({ week: 20, year: 2024 });
  });

  it("rejects invalid type value", () => {
    expect(() =>
      socialMatchesQuerySchema.parse({ type: "invalid", week: "10", year: "2026" }),
    ).toThrow();
  });

  it("rejects missing type", () => {
    expect(() => socialMatchesQuerySchema.parse({ week: "10", year: "2026" })).toThrow();
  });

  it("rejects week below 1", () => {
    expect(() =>
      socialMatchesQuerySchema.parse({ type: "preview", week: "0", year: "2026" }),
    ).toThrow();
  });

  it("rejects week above 53", () => {
    expect(() =>
      socialMatchesQuerySchema.parse({ type: "preview", week: "54", year: "2026" }),
    ).toThrow();
  });

  it("rejects year below 2020", () => {
    expect(() =>
      socialMatchesQuerySchema.parse({ type: "results", week: "10", year: "2019" }),
    ).toThrow();
  });

  it("rejects year above 2100", () => {
    expect(() =>
      socialMatchesQuerySchema.parse({ type: "results", week: "10", year: "2101" }),
    ).toThrow();
  });

  it("rejects non-numeric week string", () => {
    expect(() =>
      socialMatchesQuerySchema.parse({ type: "preview", week: "abc", year: "2026" }),
    ).toThrow();
  });
});

describe("socialGenerateBodySchema", () => {
  const validBody = {
    type: "results",
    calendarWeek: 10,
    year: 2026,
    matches: [{ matchId: 1, order: 1 }],
    playerPhotoId: 5,
    backgroundId: 3,
    playerPosition: { x: 100, y: 200, scale: 1.0 },
  };

  it("parses a fully valid body", () => {
    const result = socialGenerateBodySchema.parse(validBody);
    expect(result).toMatchObject(validBody);
  });

  it("accepts preview type", () => {
    const result = socialGenerateBodySchema.parse({ ...validBody, type: "preview" });
    expect(result.type).toBe("preview");
  });

  it("accepts matches array with maximum 6 entries", () => {
    const matches = Array.from({ length: 6 }, (_, i) => ({ matchId: i + 1, order: i + 1 }));
    const result = socialGenerateBodySchema.parse({ ...validBody, matches });
    expect(result.matches).toHaveLength(6);
  });

  it("accepts scale at minimum boundary 0.1", () => {
    const result = socialGenerateBodySchema.parse({
      ...validBody,
      playerPosition: { x: 0, y: 0, scale: 0.1 },
    });
    expect(result.playerPosition.scale).toBe(0.1);
  });

  it("accepts scale at maximum boundary 5", () => {
    const result = socialGenerateBodySchema.parse({
      ...validBody,
      playerPosition: { x: 0, y: 0, scale: 5 },
    });
    expect(result.playerPosition.scale).toBe(5);
  });

  it("accepts calendarWeek at boundary 1", () => {
    const result = socialGenerateBodySchema.parse({ ...validBody, calendarWeek: 1 });
    expect(result.calendarWeek).toBe(1);
  });

  it("accepts calendarWeek at boundary 53", () => {
    const result = socialGenerateBodySchema.parse({ ...validBody, calendarWeek: 53 });
    expect(result.calendarWeek).toBe(53);
  });

  it("rejects invalid type", () => {
    expect(() =>
      socialGenerateBodySchema.parse({ ...validBody, type: "highlight" }),
    ).toThrow();
  });

  it("rejects empty matches array", () => {
    expect(() => socialGenerateBodySchema.parse({ ...validBody, matches: [] })).toThrow();
  });

  it("rejects matches array with more than 6 entries", () => {
    const matches = Array.from({ length: 7 }, (_, i) => ({ matchId: i + 1, order: i + 1 }));
    expect(() => socialGenerateBodySchema.parse({ ...validBody, matches })).toThrow();
  });

  it("rejects scale below 0.1", () => {
    expect(() =>
      socialGenerateBodySchema.parse({
        ...validBody,
        playerPosition: { x: 0, y: 0, scale: 0.09 },
      }),
    ).toThrow();
  });

  it("rejects scale above 5", () => {
    expect(() =>
      socialGenerateBodySchema.parse({
        ...validBody,
        playerPosition: { x: 0, y: 0, scale: 5.01 },
      }),
    ).toThrow();
  });

  it("rejects calendarWeek below 1", () => {
    expect(() =>
      socialGenerateBodySchema.parse({ ...validBody, calendarWeek: 0 }),
    ).toThrow();
  });

  it("rejects calendarWeek above 53", () => {
    expect(() =>
      socialGenerateBodySchema.parse({ ...validBody, calendarWeek: 54 }),
    ).toThrow();
  });

  it("rejects year below 2020", () => {
    expect(() => socialGenerateBodySchema.parse({ ...validBody, year: 2019 })).toThrow();
  });

  it("rejects year above 2100", () => {
    expect(() => socialGenerateBodySchema.parse({ ...validBody, year: 2101 })).toThrow();
  });

  it("rejects missing playerPosition", () => {
    const { playerPosition: _, ...bodyWithout } = validBody;
    expect(() => socialGenerateBodySchema.parse(bodyWithout)).toThrow();
  });

  it("rejects missing matches", () => {
    const { matches: _, ...bodyWithout } = validBody;
    expect(() => socialGenerateBodySchema.parse(bodyWithout)).toThrow();
  });
});

describe("socialIdParamSchema", () => {
  it("coerces string id to positive integer", () => {
    expect(socialIdParamSchema.parse({ id: "5" })).toEqual({ id: 5 });
  });

  it("accepts numeric id directly", () => {
    expect(socialIdParamSchema.parse({ id: 10 })).toEqual({ id: 10 });
  });

  it("rejects zero", () => {
    expect(() => socialIdParamSchema.parse({ id: 0 })).toThrow();
  });

  it("rejects negative id", () => {
    expect(() => socialIdParamSchema.parse({ id: -1 })).toThrow();
  });

  it("rejects non-numeric string", () => {
    expect(() => socialIdParamSchema.parse({ id: "abc" })).toThrow();
  });

  it("rejects missing id", () => {
    expect(() => socialIdParamSchema.parse({})).toThrow();
  });
});
