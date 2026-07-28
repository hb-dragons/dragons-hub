import { describe, expect, it } from "vitest";
import { AppError } from "../../app-error";
import { AssignmentError, type AssignmentErrorCode } from "./referee-assignment.errors";

describe("AssignmentError", () => {
  it("is an AppError so the central handler maps it", () => {
    expect(new AssignmentError("nope", "GAME_NOT_FOUND")).toBeInstanceOf(AppError);
  });

  // This table replaces the two ERROR_STATUS_MAP copies that lived in
  // routes/admin/referee-assignment.routes.ts and routes/referee/assignment.routes.ts.
  // The admin copy was missing NOT_OWN_CLUB and NOT_ASSIGNED, so those two codes
  // would have surfaced as a 500 had an admin route ever reached them.
  const cases: [AssignmentErrorCode, number][] = [
    ["GAME_NOT_FOUND", 404],
    ["NOT_QUALIFIED", 422],
    ["SLOT_TAKEN", 409],
    ["DENY_RULE", 403],
    ["FEDERATION_ERROR", 502],
    ["NOT_OWN_CLUB", 403],
    ["NOT_ASSIGNED", 409],
  ];

  it.each(cases)("maps %s to %i", (code, status) => {
    const error = new AssignmentError("message for humans", code);

    expect(error.status).toBe(status);
    expect(error.code).toBe(code);
    expect(error.message).toBe("message for humans");
    expect(error.name).toBe("AssignmentError");
  });
});
