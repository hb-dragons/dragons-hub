import { describe, expect, it } from "vitest";
import {
  bookingIdParamSchema,
  bookingListQuerySchema,
  bookingUpdateBodySchema,
  bookingStatusBodySchema,
  bookingCreateBodySchema,
} from "./booking.schemas";

describe("bookingIdParamSchema", () => {
  it("coerces string id to positive integer", () => {
    expect(bookingIdParamSchema.parse({ id: "5" })).toEqual({ id: 5 });
  });

  it("rejects zero", () => {
    expect(() => bookingIdParamSchema.parse({ id: 0 })).toThrow();
  });

  it("rejects negative numbers", () => {
    expect(() => bookingIdParamSchema.parse({ id: -1 })).toThrow();
  });

  it("rejects non-numeric strings", () => {
    expect(() => bookingIdParamSchema.parse({ id: "abc" })).toThrow();
  });
});

describe("bookingListQuerySchema", () => {
  it("accepts empty query", () => {
    expect(bookingListQuerySchema.parse({})).toEqual({});
  });

  it("accepts valid status filter", () => {
    expect(bookingListQuerySchema.parse({ status: "pending" })).toEqual({
      status: "pending",
    });
  });

  it("accepts all valid status values", () => {
    for (const status of ["pending", "requested", "confirmed", "cancelled"]) {
      expect(bookingListQuerySchema.parse({ status })).toEqual({ status });
    }
  });

  it("rejects invalid status", () => {
    expect(() =>
      bookingListQuerySchema.parse({ status: "invalid" }),
    ).toThrow();
  });

  it("accepts valid date range", () => {
    expect(
      bookingListQuerySchema.parse({
        dateFrom: "2025-01-01",
        dateTo: "2025-12-31",
      }),
    ).toEqual({ dateFrom: "2025-01-01", dateTo: "2025-12-31" });
  });

  it("accepts dateFrom only", () => {
    expect(
      bookingListQuerySchema.parse({ dateFrom: "2025-01-01" }),
    ).toEqual({ dateFrom: "2025-01-01" });
  });

  it("accepts dateTo only", () => {
    expect(bookingListQuerySchema.parse({ dateTo: "2025-12-31" })).toEqual({
      dateTo: "2025-12-31",
    });
  });

  it("rejects invalid date format", () => {
    expect(() =>
      bookingListQuerySchema.parse({ dateFrom: "01-01-2025" }),
    ).toThrow();
  });

  it("rejects non-date string for dateFrom", () => {
    expect(() =>
      bookingListQuerySchema.parse({ dateFrom: "not-a-date" }),
    ).toThrow();
  });

  it("rejects non-date string for dateTo", () => {
    expect(() =>
      bookingListQuerySchema.parse({ dateTo: "not-a-date" }),
    ).toThrow();
  });

  it("accepts all filters combined", () => {
    const input = {
      status: "confirmed" as const,
      dateFrom: "2025-03-01",
      dateTo: "2025-03-31",
    };
    expect(bookingListQuerySchema.parse(input)).toEqual(input);
  });
});

describe("bookingUpdateBodySchema", () => {
  it("accepts empty object", () => {
    expect(bookingUpdateBodySchema.parse({})).toEqual({});
  });

  it("accepts override start time in HH:MM format", () => {
    expect(
      bookingUpdateBodySchema.parse({ overrideStartTime: "13:00" }),
    ).toEqual({ overrideStartTime: "13:00" });
  });

  it("accepts override start time in HH:MM:SS format", () => {
    expect(
      bookingUpdateBodySchema.parse({ overrideStartTime: "13:00:00" }),
    ).toEqual({ overrideStartTime: "13:00:00" });
  });

  it("accepts null override start time", () => {
    expect(
      bookingUpdateBodySchema.parse({ overrideStartTime: null }),
    ).toEqual({ overrideStartTime: null });
  });

  it("accepts override end time", () => {
    expect(
      bookingUpdateBodySchema.parse({ overrideEndTime: "18:00" }),
    ).toEqual({ overrideEndTime: "18:00" });
  });

  it("accepts null override end time", () => {
    expect(
      bookingUpdateBodySchema.parse({ overrideEndTime: null }),
    ).toEqual({ overrideEndTime: null });
  });

  it("rejects time without colon", () => {
    expect(() =>
      bookingUpdateBodySchema.parse({ overrideStartTime: "1300" }),
    ).toThrow();
  });

  it("accepts override reason", () => {
    expect(
      bookingUpdateBodySchema.parse({ overrideReason: "Early start" }),
    ).toEqual({ overrideReason: "Early start" });
  });

  it("accepts null override reason", () => {
    expect(
      bookingUpdateBodySchema.parse({ overrideReason: null }),
    ).toEqual({ overrideReason: null });
  });

  it("rejects override reason exceeding 500 characters", () => {
    expect(() =>
      bookingUpdateBodySchema.parse({ overrideReason: "x".repeat(501) }),
    ).toThrow();
  });

  it("accepts valid status", () => {
    expect(
      bookingUpdateBodySchema.parse({ status: "confirmed" }),
    ).toEqual({ status: "confirmed" });
  });

  it("rejects invalid status", () => {
    expect(() =>
      bookingUpdateBodySchema.parse({ status: "invalid" }),
    ).toThrow();
  });

  it("accepts notes", () => {
    expect(
      bookingUpdateBodySchema.parse({ notes: "Some notes" }),
    ).toEqual({ notes: "Some notes" });
  });

  it("accepts null notes", () => {
    expect(bookingUpdateBodySchema.parse({ notes: null })).toEqual({
      notes: null,
    });
  });

  it("rejects notes exceeding 1000 characters", () => {
    expect(() =>
      bookingUpdateBodySchema.parse({ notes: "x".repeat(1001) }),
    ).toThrow();
  });

  it("accepts all fields combined", () => {
    const input = {
      overrideStartTime: "13:00",
      overrideEndTime: "18:00",
      overrideReason: "Extended",
      status: "requested" as const,
      notes: "Need extra time",
    };
    expect(bookingUpdateBodySchema.parse(input)).toEqual(input);
  });
});

describe("bookingStatusBodySchema", () => {
  it("accepts pending", () => {
    expect(bookingStatusBodySchema.parse({ status: "pending" })).toEqual({
      status: "pending",
    });
  });

  it("accepts requested", () => {
    expect(bookingStatusBodySchema.parse({ status: "requested" })).toEqual({
      status: "requested",
    });
  });

  it("accepts confirmed", () => {
    expect(bookingStatusBodySchema.parse({ status: "confirmed" })).toEqual({
      status: "confirmed",
    });
  });

  it("accepts cancelled", () => {
    expect(bookingStatusBodySchema.parse({ status: "cancelled" })).toEqual({
      status: "cancelled",
    });
  });

  it("rejects invalid status", () => {
    expect(() =>
      bookingStatusBodySchema.parse({ status: "invalid" }),
    ).toThrow();
  });

  it("rejects missing status", () => {
    expect(() => bookingStatusBodySchema.parse({})).toThrow();
  });
});

describe("bookingCreateBodySchema", () => {
  const validInput = {
    venueId: 10,
    date: "2025-03-15",
    overrideStartTime: "14:00",
    overrideEndTime: "17:00",
  };

  it("accepts valid input with required fields only", () => {
    expect(bookingCreateBodySchema.parse(validInput)).toEqual(validInput);
  });

  it("accepts all optional fields", () => {
    const input = {
      ...validInput,
      overrideReason: "Tournament",
      notes: "Extra setup needed",
      matchIds: [1, 2, 3],
    };
    expect(bookingCreateBodySchema.parse(input)).toEqual(input);
  });

  it("accepts null overrideReason and notes", () => {
    const input = { ...validInput, overrideReason: null, notes: null };
    expect(bookingCreateBodySchema.parse(input)).toEqual(input);
  });

  it("rejects missing venueId", () => {
    const { venueId: _, ...rest } = validInput;
    expect(() => bookingCreateBodySchema.parse(rest)).toThrow();
  });

  it("rejects missing date", () => {
    const { date: _, ...rest } = validInput;
    expect(() => bookingCreateBodySchema.parse(rest)).toThrow();
  });

  it("rejects missing overrideStartTime", () => {
    const { overrideStartTime: _, ...rest } = validInput;
    expect(() => bookingCreateBodySchema.parse(rest)).toThrow();
  });

  it("rejects missing overrideEndTime", () => {
    const { overrideEndTime: _, ...rest } = validInput;
    expect(() => bookingCreateBodySchema.parse(rest)).toThrow();
  });

  it("rejects invalid date format", () => {
    expect(() =>
      bookingCreateBodySchema.parse({ ...validInput, date: "15-03-2025" }),
    ).toThrow();
  });

  it("rejects invalid time format", () => {
    expect(() =>
      bookingCreateBodySchema.parse({ ...validInput, overrideStartTime: "1400" }),
    ).toThrow();
  });

  it("rejects non-positive venueId", () => {
    expect(() =>
      bookingCreateBodySchema.parse({ ...validInput, venueId: 0 }),
    ).toThrow();
  });

  it("rejects overrideReason exceeding 500 characters", () => {
    expect(() =>
      bookingCreateBodySchema.parse({ ...validInput, overrideReason: "x".repeat(501) }),
    ).toThrow();
  });

  it("rejects notes exceeding 1000 characters", () => {
    expect(() =>
      bookingCreateBodySchema.parse({ ...validInput, notes: "x".repeat(1001) }),
    ).toThrow();
  });

  it("rejects non-positive matchIds", () => {
    expect(() =>
      bookingCreateBodySchema.parse({ ...validInput, matchIds: [0] }),
    ).toThrow();
  });

  it("accepts empty matchIds array", () => {
    const input = { ...validInput, matchIds: [] };
    expect(bookingCreateBodySchema.parse(input)).toEqual(input);
  });

  it("accepts HH:MM:SS time format", () => {
    const input = { ...validInput, overrideStartTime: "14:00:00", overrideEndTime: "17:00:00" };
    expect(bookingCreateBodySchema.parse(input)).toEqual(input);
  });
});
