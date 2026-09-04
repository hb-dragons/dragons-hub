import { describe, it, expect } from "vitest";
import {
  staffPersonIdParamSchema,
  staffPersonCreateBodySchema,
  staffPersonUpdateBodySchema,
  staffPersonListQuerySchema,
} from "./staff-people";

describe("staffPersonIdParamSchema", () => {
  it("coerces the id from the path", () => {
    expect(staffPersonIdParamSchema.parse({ id: "9" })).toEqual({ id: 9 });
  });

  it("rejects a non-positive id", () => {
    expect(staffPersonIdParamSchema.safeParse({ id: "0" }).success).toBe(false);
  });
});

describe("staffPersonCreateBodySchema", () => {
  it("accepts the minimum body", () => {
    expect(staffPersonCreateBodySchema.parse({ firstName: "Ada", lastName: "Lovelace" })).toEqual(
      { firstName: "Ada", lastName: "Lovelace" },
    );
  });

  it("accepts every optional field", () => {
    const parsed = staffPersonCreateBodySchema.parse({
      firstName: "Ada",
      lastName: "Lovelace",
      phone: "+49 170 1234567",
      email: "ada@example.de",
      licence: "C-Lizenz",
    });
    expect(parsed.email).toBe("ada@example.de");
    expect(parsed.licence).toBe("C-Lizenz");
  });

  it("trims surrounding whitespace off the names", () => {
    expect(
      staffPersonCreateBodySchema.parse({ firstName: " Ada ", lastName: " Lovelace " }),
    ).toMatchObject({ firstName: "Ada", lastName: "Lovelace" });
  });

  it("accepts nulls for the optional contact fields", () => {
    const parsed = staffPersonCreateBodySchema.parse({
      firstName: "Ada",
      lastName: "Lovelace",
      phone: null,
      email: null,
      licence: null,
    });
    expect(parsed.phone).toBeNull();
  });

  it("rejects a blank first name", () => {
    expect(
      staffPersonCreateBodySchema.safeParse({ firstName: "  ", lastName: "Lovelace" }).success,
    ).toBe(false);
  });

  it("rejects a missing last name", () => {
    expect(staffPersonCreateBodySchema.safeParse({ firstName: "Ada" }).success).toBe(false);
  });

  it("rejects an email that is not an address", () => {
    expect(
      staffPersonCreateBodySchema.safeParse({
        firstName: "Ada",
        lastName: "Lovelace",
        email: "not-an-address",
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown field — the portrait is uploaded, not posted as a name", () => {
    expect(
      staffPersonCreateBodySchema.safeParse({
        firstName: "Ada",
        lastName: "Lovelace",
        photoFilename: "staff/1.jpg",
      }).success,
    ).toBe(false);
  });

  it("rejects the role — it belongs to the assignment", () => {
    expect(
      staffPersonCreateBodySchema.safeParse({
        firstName: "Ada",
        lastName: "Lovelace",
        role: "trainer",
      }).success,
    ).toBe(false);
  });
});

describe("staffPersonUpdateBodySchema", () => {
  it("accepts a single-field patch", () => {
    expect(staffPersonUpdateBodySchema.parse({ phone: "+49 170 1234567" })).toEqual({
      phone: "+49 170 1234567",
    });
  });

  it("accepts an empty patch", () => {
    expect(staffPersonUpdateBodySchema.parse({})).toEqual({});
  });

  it("treats an empty contact string as a clear", () => {
    expect(staffPersonUpdateBodySchema.parse({ phone: "", email: "" })).toEqual({
      phone: null,
      email: null,
    });
  });

  it("rejects a null first name — the column is NOT NULL", () => {
    expect(staffPersonUpdateBodySchema.safeParse({ firstName: null }).success).toBe(false);
  });

  it("rejects an unknown field", () => {
    expect(staffPersonUpdateBodySchema.safeParse({ teamEntryId: 4 }).success).toBe(false);
  });
});

describe("staffPersonListQuerySchema", () => {
  it("accepts an absent search", () => {
    expect(staffPersonListQuerySchema.parse({})).toEqual({});
  });

  it("trims the search fragment", () => {
    expect(staffPersonListQuerySchema.parse({ q: " love " })).toEqual({ q: "love" });
  });

  it("rejects a search longer than a name", () => {
    expect(staffPersonListQuerySchema.safeParse({ q: "x".repeat(101) }).success).toBe(false);
  });
});
