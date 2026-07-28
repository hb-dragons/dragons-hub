import { describe, expect, it } from "vitest";
import { AppError } from "../../app-error";
import { BroadcastError } from "./config.errors";

describe("BroadcastError", () => {
  it("is an AppError so the central handler maps it", () => {
    expect(new BroadcastError("MISSING_MATCH")).toBeInstanceOf(AppError);
  });

  // The class used to be `super(code)`, so its message was the bare code and
  // admin/broadcast.routes.ts substituted human-readable text on the way out.
  // Central mapping returns `error.message` directly, so the text lives here.
  it("maps MISSING_MATCH to 400 with the text the route used to substitute", () => {
    const error = new BroadcastError("MISSING_MATCH");

    expect(error.status).toBe(400);
    expect(error.code).toBe("MISSING_MATCH");
    expect(error.message).toBe("Cannot go live without matchId");
    expect(error.name).toBe("BroadcastError");
  });

  // Not a client error: the device passed isConfiguredDevice() but its row is
  // absent. It stays a 500 so it keeps reaching Cloud Error Reporting.
  it("maps ROW_MISSING to 500", () => {
    const error = new BroadcastError("ROW_MISSING");

    expect(error.status).toBe(500);
    expect(error.code).toBe("ROW_MISSING");
    expect(error.message).toMatch(/broadcast config/i);
  });
});
