import { describe, expect, it } from "vitest";
import {
  hallTimeDateParamSchema,
  hallTimeImportBodySchema,
  hallTimeListQuerySchema,
  hallTimeUpsertBodySchema,
} from "./venue";

const open = { date: "2026-09-19", kind: "open", startTime: "10:00", endTime: "22:00", note: null };
const closed = { date: "2026-10-03", kind: "closed", startTime: null, endTime: null, note: "Tag der Dt. Einheit" };

describe("hallTimeImportBodySchema", () => {
  it("accepts open and closed rows and trims seconds off times", () => {
    const parsed = hallTimeImportBodySchema.parse({
      rows: [open, closed, { ...open, date: "2026-09-20", startTime: "10:00:00", endTime: "14:00:00" }],
      updatedOn: "2026-09-14",
    });
    expect(parsed.rows[2]).toMatchObject({ startTime: "10:00", endTime: "14:00" });
  });

  it("rejects an open row without both times or with an inverted window", () => {
    expect(hallTimeImportBodySchema.safeParse({ rows: [{ ...open, endTime: null }] }).success).toBe(false);
    expect(
      hallTimeImportBodySchema.safeParse({ rows: [{ ...open, startTime: "14:00", endTime: "10:00" }] }).success,
    ).toBe(false);
  });

  it("rejects duplicate dates, an empty list and unknown keys", () => {
    expect(hallTimeImportBodySchema.safeParse({ rows: [open, { ...open }] }).success).toBe(false);
    expect(hallTimeImportBodySchema.safeParse({ rows: [] }).success).toBe(false);
    expect(hallTimeImportBodySchema.safeParse({ rows: [{ ...open, extra: 1 }] }).success).toBe(false);
  });
});

describe("hallTimeUpsertBodySchema", () => {
  it("takes a closed day without times", () => {
    expect(hallTimeUpsertBodySchema.parse({ kind: "closed", startTime: null, endTime: null, note: "Ferien" }).kind).toBe(
      "closed",
    );
  });

  it("rejects an open day missing a time", () => {
    expect(
      hallTimeUpsertBodySchema.safeParse({ kind: "open", startTime: "10:00", endTime: null, note: null }).success,
    ).toBe(false);
  });
});

describe("hallTimeDateParamSchema + hallTimeListQuerySchema", () => {
  it("coerces the id and keeps the date", () => {
    expect(hallTimeDateParamSchema.parse({ id: "7", date: "2026-09-19" })).toEqual({ id: 7, date: "2026-09-19" });
    expect(hallTimeDateParamSchema.safeParse({ id: "7", date: "19.09.2026" }).success).toBe(false);
  });

  it("rejects a range whose from is after to", () => {
    expect(hallTimeListQuerySchema.safeParse({ from: "2026-10-01", to: "2026-09-01" }).success).toBe(false);
    expect(hallTimeListQuerySchema.parse({})).toEqual({});
  });
});
