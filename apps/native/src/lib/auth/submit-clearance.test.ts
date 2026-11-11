import { describe, expect, it } from "vitest";
import { submitClearance } from "./submit-clearance";

describe("submitClearance", () => {
  it.each([
    // field bottom, button bottom, gap → offset under the focused field
    ["the e-mail field: password and button below it", 120, 260, 16, 156],
    ["the password field: only the button below it", 196, 260, 16, 80],
    ["an error line pushes the button further down", 196, 300, 16, 120],
  ])("keeps the button above the keyboard from %s", (_case, field, button, gap, expected) => {
    expect(submitClearance({ fieldBottom: field, buttonBottom: button, gap })).toBe(expected);
  });

  // Before the first layout pass both bottoms are unknown (0).
  it("falls back to the gap until the form has been laid out", () => {
    expect(submitClearance({ fieldBottom: 0, buttonBottom: 0, gap: 16 })).toBe(16);
  });

  it("never goes below the gap", () => {
    expect(submitClearance({ fieldBottom: 300, buttonBottom: 260, gap: 16 })).toBe(16);
  });
});
