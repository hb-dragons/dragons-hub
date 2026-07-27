import { describe, expect, it, beforeEach, vi } from "vitest";

const envHolder = vi.hoisted(
  () => ({}) as Record<string, string | number | undefined>,
);

vi.mock("../../../config/env", () => ({ env: envHolder }));

import { readSmtpSettings } from "./smtp-settings";

const FULL = {
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: 587,
  SMTP_USER: "noreply@example.com",
  SMTP_PASSWORD: "secret",
  SMTP_FROM: "Dragons <noreply@example.com>",
} as const;

beforeEach(() => {
  for (const key of Object.keys(envHolder)) delete envHolder[key];
});

describe("readSmtpSettings", () => {
  it("returns the settings when all five vars are set", () => {
    Object.assign(envHolder, FULL);

    expect(readSmtpSettings()).toEqual({
      host: "smtp.example.com",
      port: 587,
      user: "noreply@example.com",
      password: "secret",
      from: "Dragons <noreply@example.com>",
    });
  });

  it("returns null when nothing is set", () => {
    expect(readSmtpSettings()).toBeNull();
  });

  // All five or nothing: a relay host with no credentials, or credentials with
  // no From, cannot produce a delivered message, so a partial set must read as
  // "not configured" rather than fail once per notification.
  it.each(Object.keys(FULL))("returns null when only %s is missing", (missing) => {
    Object.assign(envHolder, FULL);
    delete envHolder[missing];

    expect(readSmtpSettings()).toBeNull();
  });
});
