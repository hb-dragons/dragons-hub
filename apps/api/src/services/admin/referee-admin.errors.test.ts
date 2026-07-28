import { describe, expect, it } from "vitest";
import { AppError } from "../../app-error";
import { RefereeSettingsError, type RefereeSettingsErrorCode } from "./referee-admin.errors";

describe("RefereeSettingsError", () => {
  it("is an AppError so the central handler maps it", () => {
    expect(new RefereeSettingsError("nope", "NOT_FOUND")).toBeInstanceOf(AppError);
  });

  // referee.routes.ts used to map these inline as `NOT_FOUND ? 404 : 400`.
  // NOT_OWN_CLUB is 400 here and 403 on AssignmentError: there it means the
  // caller may not act, here it means the request body names the wrong referee.
  const cases: [RefereeSettingsErrorCode, number][] = [
    ["NOT_FOUND", 404],
    ["NOT_OWN_CLUB", 400],
    ["VALIDATION_ERROR", 400],
  ];

  it.each(cases)("maps %s to %i", (code, status) => {
    const error = new RefereeSettingsError("message for humans", code);

    expect(error.status).toBe(status);
    expect(error.code).toBe(code);
    expect(error.message).toBe("message for humans");
    expect(error.name).toBe("RefereeSettingsError");
  });
});
