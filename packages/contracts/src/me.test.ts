import { describe, it, expect } from "vitest";
import { meStaffUpdateBodySchema } from "./me";

describe("meStaffUpdateBodySchema", () => {
  it("accepts an empty patch", () => {
    expect(meStaffUpdateBodySchema.parse({})).toEqual({});
  });

  it("accepts the three self-editable fields", () => {
    expect(
      meStaffUpdateBodySchema.parse({
        phone: "+49 170 1234567",
        email: "ada@example.de",
        licence: "C-Lizenz",
      }),
    ).toEqual({
      phone: "+49 170 1234567",
      email: "ada@example.de",
      licence: "C-Lizenz",
    });
  });

  it("reads a cleared field as null", () => {
    expect(meStaffUpdateBodySchema.parse({ phone: "", licence: "  " })).toEqual({
      phone: null,
      licence: null,
    });
  });

  it("rejects a malformed email", () => {
    expect(meStaffUpdateBodySchema.safeParse({ email: "not-an-address" }).success).toBe(false);
  });

  it("rejects the fields the club owns", () => {
    for (const body of [
      { firstName: "Ada" },
      { lastName: "Lovelace" },
      { photoFilename: "portrait.webp" },
      { personId: 7 },
    ]) {
      expect(meStaffUpdateBodySchema.safeParse(body).success).toBe(false);
    }
  });
});
