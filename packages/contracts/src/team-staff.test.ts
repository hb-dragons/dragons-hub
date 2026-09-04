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
  it("accepts an existing person", () => {
    expect(teamStaffCreateBodySchema.parse({ personId: 4, role: "trainer" })).toEqual({
      personId: 4,
      role: "trainer",
    });
  });

  it("accepts an inline new person", () => {
    const parsed = teamStaffCreateBodySchema.parse({
      person: { firstName: " Ada ", lastName: "Lovelace", phone: "+49 170 1234567" },
      role: "co_trainer",
      refereeContact: true,
    });
    expect(parsed).toMatchObject({
      person: { firstName: "Ada", lastName: "Lovelace" },
      refereeContact: true,
    });
  });

  it("rejects a body naming both a person id and a new person", () => {
    expect(
      teamStaffCreateBodySchema.safeParse({
        personId: 4,
        person: { firstName: "Ada", lastName: "Lovelace" },
        role: "trainer",
      }).success,
    ).toBe(false);
  });

  it("rejects a body naming neither", () => {
    expect(teamStaffCreateBodySchema.safeParse({ role: "trainer" }).success).toBe(false);
  });

  it("rejects a role outside the two allowed values", () => {
    expect(
      teamStaffCreateBodySchema.safeParse({ personId: 4, role: "betreuer" }).success,
    ).toBe(false);
  });

  it("rejects a blank first name on the inline person", () => {
    expect(
      teamStaffCreateBodySchema.safeParse({
        person: { firstName: "  ", lastName: "Lovelace" },
        role: "trainer",
      }).success,
    ).toBe(false);
  });

  it("rejects an email that is not an address", () => {
    expect(
      teamStaffCreateBodySchema.safeParse({
        person: { firstName: "Ada", lastName: "Lovelace", email: "not-an-address" },
        role: "trainer",
      }).success,
    ).toBe(false);
  });

  it("rejects contact data alongside a person id — it belongs to the person", () => {
    expect(
      teamStaffCreateBodySchema.safeParse({
        personId: 4,
        role: "trainer",
        phone: "+49 170 1234567",
      }).success,
    ).toBe(false);
  });

  it("rejects a missing role", () => {
    expect(teamStaffCreateBodySchema.safeParse({ personId: 4 }).success).toBe(false);
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

  it("rejects the person's own fields — they are edited on the person", () => {
    expect(teamStaffUpdateBodySchema.safeParse({ firstName: "Ada" }).success).toBe(false);
    expect(teamStaffUpdateBodySchema.safeParse({ phone: "+49 170 1234567" }).success).toBe(
      false,
    );
  });

  it("rejects moving the assignment to another person", () => {
    expect(teamStaffUpdateBodySchema.safeParse({ personId: 9 }).success).toBe(false);
  });

  it("rejects an unknown field", () => {
    expect(teamStaffUpdateBodySchema.safeParse({ teamEntryId: 4 }).success).toBe(false);
  });
});
