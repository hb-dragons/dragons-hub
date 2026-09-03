import { describe, it, expect } from "vitest";
import {
  teamStaffParamSchema,
  teamStaffCreateBodySchema,
  teamStaffUpdateBodySchema,
} from "./team-staff";

describe("teamStaffParamSchema", () => {
  it("coerces both ids from the path", () => {
    expect(teamStaffParamSchema.parse({ id: "7", staffId: "12" })).toEqual({
      id: 7,
      staffId: 12,
    });
  });

  it("rejects a non-positive staff id", () => {
    expect(teamStaffParamSchema.safeParse({ id: "7", staffId: "0" }).success).toBe(false);
  });

  it("rejects a missing staff id", () => {
    expect(teamStaffParamSchema.safeParse({ id: "7" }).success).toBe(false);
  });
});

describe("teamStaffCreateBodySchema", () => {
  it("accepts the minimum body", () => {
    expect(
      teamStaffCreateBodySchema.parse({
        firstName: "Ada",
        lastName: "Lovelace",
        role: "trainer",
      }),
    ).toEqual({ firstName: "Ada", lastName: "Lovelace", role: "trainer" });
  });

  it("accepts every optional field", () => {
    const parsed = teamStaffCreateBodySchema.parse({
      firstName: "Ada",
      lastName: "Lovelace",
      role: "co_trainer",
      phone: "+49 170 1234567",
      email: "ada@example.de",
      licence: "C-Lizenz",
      refereeContact: true,
    });
    expect(parsed.refereeContact).toBe(true);
    expect(parsed.email).toBe("ada@example.de");
  });

  it("accepts nulls for the optional contact fields", () => {
    const parsed = teamStaffCreateBodySchema.parse({
      firstName: "Ada",
      lastName: "Lovelace",
      role: "trainer",
      phone: null,
      email: null,
      licence: null,
    });
    expect(parsed.phone).toBeNull();
  });

  it("rejects a role outside the two allowed values", () => {
    expect(
      teamStaffCreateBodySchema.safeParse({
        firstName: "Ada",
        lastName: "Lovelace",
        role: "betreuer",
      }).success,
    ).toBe(false);
  });

  it("rejects a blank first name", () => {
    expect(
      teamStaffCreateBodySchema.safeParse({
        firstName: "  ",
        lastName: "Lovelace",
        role: "trainer",
      }).success,
    ).toBe(false);
  });

  it("trims surrounding whitespace off the names", () => {
    const parsed = teamStaffCreateBodySchema.parse({
      firstName: " Ada ",
      lastName: " Lovelace ",
      role: "trainer",
    });
    expect(parsed).toMatchObject({ firstName: "Ada", lastName: "Lovelace" });
  });

  it("rejects an email that is not an address", () => {
    expect(
      teamStaffCreateBodySchema.safeParse({
        firstName: "Ada",
        lastName: "Lovelace",
        role: "trainer",
        email: "not-an-address",
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown field", () => {
    expect(
      teamStaffCreateBodySchema.safeParse({
        firstName: "Ada",
        lastName: "Lovelace",
        role: "trainer",
        photoFilename: "staff/1.jpg",
      }).success,
    ).toBe(false);
  });

  it("rejects a missing last name", () => {
    expect(
      teamStaffCreateBodySchema.safeParse({ firstName: "Ada", role: "trainer" }).success,
    ).toBe(false);
  });
});

describe("teamStaffUpdateBodySchema", () => {
  it("accepts a single-field patch", () => {
    expect(teamStaffUpdateBodySchema.parse({ refereeContact: false })).toEqual({
      refereeContact: false,
    });
  });

  it("accepts an empty patch", () => {
    expect(teamStaffUpdateBodySchema.parse({})).toEqual({});
  });

  it("accepts a role change", () => {
    expect(teamStaffUpdateBodySchema.parse({ role: "co_trainer" })).toEqual({
      role: "co_trainer",
    });
  });

  it("rejects a null first name — the column is NOT NULL", () => {
    expect(teamStaffUpdateBodySchema.safeParse({ firstName: null }).success).toBe(false);
  });

  it("rejects an unknown field", () => {
    expect(teamStaffUpdateBodySchema.safeParse({ teamEntryId: 4 }).success).toBe(false);
  });

  it("clears a contact field with null", () => {
    expect(teamStaffUpdateBodySchema.parse({ phone: null, licence: null })).toEqual({
      phone: null,
      licence: null,
    });
  });

  it("treats an empty contact string as a clear", () => {
    expect(teamStaffUpdateBodySchema.parse({ phone: "", email: "" })).toEqual({
      phone: null,
      email: null,
    });
  });
});
