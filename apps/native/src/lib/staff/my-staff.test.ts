import { describe, expect, it } from "vitest";
import { buildStaffPatch, contactFields, showsStaffContact } from "./my-staff";
import type { MyStaffProfile } from "@dragons/shared";

const profile: MyStaffProfile = {
  id: 4,
  firstName: "Ada",
  lastName: "Lovelace",
  phone: "+49 170 1234567",
  email: "ada@example.de",
  licence: "C-Lizenz",
  assignments: [],
};

describe("showsStaffContact", () => {
  it("is true for a session linked to a staff person", () => {
    expect(showsStaffContact({ user: { personId: 4 } })).toBe(true);
  });

  it("is false for a signed-in account with no staff link", () => {
    expect(showsStaffContact({ user: { personId: null } })).toBe(false);
    expect(showsStaffContact({ user: {} })).toBe(false);
  });

  it("is false when nobody is signed in", () => {
    expect(showsStaffContact(null)).toBe(false);
    expect(showsStaffContact(undefined)).toBe(false);
  });
});

describe("contactFields", () => {
  it("reads the three editable fields off the record", () => {
    expect(contactFields(profile)).toEqual({
      phone: "+49 170 1234567",
      email: "ada@example.de",
      licence: "C-Lizenz",
    });
  });

  it("turns absent values into empty inputs", () => {
    expect(contactFields({ ...profile, phone: null, email: null, licence: null })).toEqual({
      phone: "",
      email: "",
      licence: "",
    });
  });

  it("starts empty while the record is still loading", () => {
    expect(contactFields(undefined)).toEqual({ phone: "", email: "", licence: "" });
  });
});

describe("buildStaffPatch", () => {
  it("sends only what the coach changed", () => {
    expect(
      buildStaffPatch({ phone: "+49 170 9999999", email: "ada@example.de", licence: "C-Lizenz" }, profile),
    ).toEqual({ phone: "+49 170 9999999" });
  });

  it("sends null for a field the coach emptied", () => {
    expect(buildStaffPatch({ phone: "", email: "ada@example.de", licence: "C-Lizenz" }, profile)).toEqual({
      phone: null,
    });
  });

  it("trims before comparing, so whitespace alone is not a change", () => {
    expect(
      buildStaffPatch({ phone: " +49 170 1234567 ", email: "ada@example.de", licence: "C-Lizenz" }, profile),
    ).toBeNull();
  });

  it("returns null when nothing changed, so a no-op save sends no request", () => {
    expect(buildStaffPatch(contactFields(profile), profile)).toBeNull();
  });

  it("treats every filled field as a change while the record is still loading", () => {
    expect(buildStaffPatch({ phone: "+49 170 1", email: "", licence: "" }, undefined)).toEqual({
      phone: "+49 170 1",
    });
  });
});
