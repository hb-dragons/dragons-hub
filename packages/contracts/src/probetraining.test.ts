import { describe, expect, it } from "vitest";
import { probetrainingRequestSchema } from "./probetraining";

/**
 * Field names are preserved 1:1 from the legacy public form
 * (dragons-app/app/components/probetraining/Form.vue), so a valid submission
 * here is exactly what that form has always sent.
 */
const validSubmission = {
  month: "Januar",
  year: 2012,
  didPlay: true,
  gender: "männlich",
  mail: "eltern@example.de",
  message: "Mein Kind würde gerne vorbeikommen.",
  acceptedPrivacy: true,
  website: "",
};

const GERMAN_MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

describe("probetrainingRequestSchema", () => {
  it("parses a complete legacy-form submission", () => {
    expect(probetrainingRequestSchema.parse(validSubmission)).toEqual(validSubmission);
  });

  it("accepts a submission without the optional message and honeypot fields", () => {
    const { message: _m, website: _w, ...rest } = validSubmission;
    expect(probetrainingRequestSchema.parse(rest)).toEqual(rest);
  });

  it.each(GERMAN_MONTHS)("accepts the German birth month %s", (month) => {
    expect(probetrainingRequestSchema.safeParse({ ...validSubmission, month }).success).toBe(
      true,
    );
  });

  // The legacy form submits German month names; an English one can only come
  // from a client that is not that form.
  it("rejects an English month name", () => {
    expect(
      probetrainingRequestSchema.safeParse({ ...validSubmission, month: "January" }).success,
    ).toBe(false);
  });

  it("rejects a birth year before 1930", () => {
    expect(
      probetrainingRequestSchema.safeParse({ ...validSubmission, year: 1929 }).success,
    ).toBe(false);
  });

  it("rejects a birth year in the future", () => {
    const nextYear = new Date().getFullYear() + 1;
    expect(
      probetrainingRequestSchema.safeParse({ ...validSubmission, year: nextYear }).success,
    ).toBe(false);
  });

  it("accepts the current year as birth year", () => {
    const thisYear = new Date().getFullYear();
    expect(
      probetrainingRequestSchema.safeParse({ ...validSubmission, year: thisYear }).success,
    ).toBe(true);
  });

  it("rejects a fractional year", () => {
    expect(
      probetrainingRequestSchema.safeParse({ ...validSubmission, year: 2010.5 }).success,
    ).toBe(false);
  });

  it.each(["männlich", "weiblich", "divers"])("accepts gender %s", (gender) => {
    expect(probetrainingRequestSchema.safeParse({ ...validSubmission, gender }).success).toBe(
      true,
    );
  });

  it("rejects a gender outside the form's options", () => {
    expect(
      probetrainingRequestSchema.safeParse({ ...validSubmission, gender: "male" }).success,
    ).toBe(false);
  });

  it("rejects a malformed mail address", () => {
    expect(
      probetrainingRequestSchema.safeParse({ ...validSubmission, mail: "not-a-mail" }).success,
    ).toBe(false);
  });

  it("accepts a message of exactly 2000 characters", () => {
    const message = "a".repeat(2000);
    expect(
      probetrainingRequestSchema.safeParse({ ...validSubmission, message }).success,
    ).toBe(true);
  });

  it("rejects a message longer than 2000 characters", () => {
    const message = "a".repeat(2001);
    expect(
      probetrainingRequestSchema.safeParse({ ...validSubmission, message }).success,
    ).toBe(false);
  });

  // Privacy consent is a checkbox that must be ticked; `false` submitted as
  // consent would be a GDPR problem, not a default.
  it("rejects acceptedPrivacy: false", () => {
    expect(
      probetrainingRequestSchema.safeParse({ ...validSubmission, acceptedPrivacy: false })
        .success,
    ).toBe(false);
  });

  it("rejects a missing acceptedPrivacy", () => {
    const { acceptedPrivacy: _a, ...rest } = validSubmission;
    expect(probetrainingRequestSchema.safeParse(rest).success).toBe(false);
  });

  // The honeypot: humans never see the field, browsers submit it empty. Any
  // content means a bot; the schema refuses it so the endpoint can drop the
  // request without doing work.
  it("rejects any content in the website honeypot", () => {
    expect(
      probetrainingRequestSchema.safeParse({ ...validSubmission, website: "x" }).success,
    ).toBe(false);
  });

  it("accepts an empty website honeypot", () => {
    expect(
      probetrainingRequestSchema.safeParse({ ...validSubmission, website: "" }).success,
    ).toBe(true);
  });
});
