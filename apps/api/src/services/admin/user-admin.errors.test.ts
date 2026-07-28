import { describe, expect, it } from "vitest";
import { AppError } from "../../app-error";
import { UserAdminError, type UserAdminErrorCode } from "./user-admin.errors";

describe("UserAdminError", () => {
  it("is an AppError so the central handler maps it", () => {
    expect(new UserAdminError("x", "USER_NOT_FOUND")).toBeInstanceOf(AppError);
  });

  const cases: [UserAdminErrorCode, number][] = [
    ["USER_NOT_FOUND", 404],
    ["REFEREE_NOT_FOUND", 404],
  ];

  it.each(cases)("maps %s to %i", (code, status) => {
    const error = new UserAdminError("message for humans", code);

    expect(error.status).toBe(status);
    expect(error.code).toBe(code);
    expect(error.message).toBe("message for humans");
    expect(error.name).toBe("UserAdminError");
  });
});
