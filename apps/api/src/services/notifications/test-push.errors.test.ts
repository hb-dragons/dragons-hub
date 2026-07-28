import { describe, expect, it } from "vitest";
import { AppError } from "../../app-error";
import { TestPushError, type TestPushErrorCode } from "./test-push.errors";

describe("TestPushError", () => {
  it("is an AppError so the central handler maps it", () => {
    expect(new TestPushError("x", "NO_DEVICES")).toBeInstanceOf(AppError);
  });

  const cases: [TestPushErrorCode, number][] = [
    ["NO_DEVICES", 400],
    ["PUSH_CHANNEL_MISSING", 500],
  ];

  it.each(cases)("maps %s to %i", (code, status) => {
    const error = new TestPushError("message for humans", code);

    expect(error.status).toBe(status);
    expect(error.code).toBe(code);
    expect(error.message).toBe("message for humans");
    expect(error.name).toBe("TestPushError");
  });
});
