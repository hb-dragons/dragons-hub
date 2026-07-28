import { describe, expect, it } from "vitest";
import { AppError } from "../../app-error";
import { PushDeviceError, type PushDeviceErrorCode } from "./push-device.errors";

describe("PushDeviceError", () => {
  it("is an AppError so the central handler maps it", () => {
    expect(new PushDeviceError("x", "TOKEN_OWNED_BY_ANOTHER_USER")).toBeInstanceOf(
      AppError,
    );
  });

  const cases: [PushDeviceErrorCode, number][] = [["TOKEN_OWNED_BY_ANOTHER_USER", 409]];

  it.each(cases)("maps %s to %i", (code, status) => {
    const error = new PushDeviceError("message for humans", code);

    expect(error.status).toBe(status);
    expect(error.code).toBe(code);
    expect(error.message).toBe("message for humans");
    expect(error.name).toBe("PushDeviceError");
  });
});
