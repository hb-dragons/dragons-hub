import { describe, expect, it } from "vitest";
import { scoreboardListQuerySchema } from "./scoreboard";

describe("scoreboardListQuerySchema", () => {
  it("parses valid query with defaults", () => {
    const result = scoreboardListQuerySchema.parse({ deviceId: "panel-01" });
    expect(result).toEqual({ deviceId: "panel-01", limit: 100 });
  });

  it("accepts explicit limit within bounds", () => {
    const result = scoreboardListQuerySchema.parse({
      deviceId: "panel-01",
      limit: "50",
    });
    expect(result).toMatchObject({ limit: 50 });
  });

  it("accepts limit at minimum (1)", () => {
    const result = scoreboardListQuerySchema.parse({
      deviceId: "panel-01",
      limit: "1",
    });
    expect(result).toMatchObject({ limit: 1 });
  });

  it("accepts limit at maximum (500)", () => {
    const result = scoreboardListQuerySchema.parse({
      deviceId: "panel-01",
      limit: "500",
    });
    expect(result).toMatchObject({ limit: 500 });
  });

  it("coerces string limit to number", () => {
    const result = scoreboardListQuerySchema.parse({
      deviceId: "panel-01",
      limit: "200",
    });
    expect(result.limit).toBe(200);
  });

  it("accepts afterId as optional", () => {
    const result = scoreboardListQuerySchema.parse({ deviceId: "panel-01" });
    expect(result.afterId).toBeUndefined();
  });

  it("accepts afterId of zero", () => {
    const result = scoreboardListQuerySchema.parse({
      deviceId: "panel-01",
      afterId: "0",
    });
    expect(result.afterId).toBe(0);
  });

  it("accepts afterId as positive integer", () => {
    const result = scoreboardListQuerySchema.parse({
      deviceId: "panel-01",
      afterId: "42",
    });
    expect(result.afterId).toBe(42);
  });

  it("rejects missing deviceId", () => {
    expect(() =>
      scoreboardListQuerySchema.parse({ limit: "10" }),
    ).toThrow();
  });

  it("rejects empty deviceId", () => {
    expect(() =>
      scoreboardListQuerySchema.parse({ deviceId: "", limit: "10" }),
    ).toThrow();
  });

  it("rejects limit of zero", () => {
    expect(() =>
      scoreboardListQuerySchema.parse({ deviceId: "panel-01", limit: "0" }),
    ).toThrow();
  });

  it("rejects limit above 500", () => {
    expect(() =>
      scoreboardListQuerySchema.parse({ deviceId: "panel-01", limit: "501" }),
    ).toThrow();
  });

  it("rejects negative limit", () => {
    expect(() =>
      scoreboardListQuerySchema.parse({ deviceId: "panel-01", limit: "-1" }),
    ).toThrow();
  });

  it("rejects non-numeric limit string", () => {
    expect(() =>
      scoreboardListQuerySchema.parse({ deviceId: "panel-01", limit: "abc" }),
    ).toThrow();
  });

  it("rejects negative afterId", () => {
    expect(() =>
      scoreboardListQuerySchema.parse({
        deviceId: "panel-01",
        afterId: "-1",
      }),
    ).toThrow();
  });
});
