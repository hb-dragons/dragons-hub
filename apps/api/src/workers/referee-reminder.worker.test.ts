import { describe, it, expect } from "vitest";
import { shouldEmitReminder } from "./referee-reminder.worker";

describe("shouldEmitReminder", () => {
  it("returns true when both slots are unfilled", () => {
    expect(shouldEmitReminder({
      isCancelled: false,
      isForfeited: false,
      sr1Assigned: null,
      sr2Assigned: null,
    })).toBe(true);
  });

  it("returns true when one slot is unfilled", () => {
    expect(shouldEmitReminder({
      isCancelled: false,
      isForfeited: false,
      sr1Assigned: "Max",
      sr2Assigned: null,
    })).toBe(true);
  });

  it("returns false when both slots are filled", () => {
    expect(shouldEmitReminder({
      isCancelled: false,
      isForfeited: false,
      sr1Assigned: "Max",
      sr2Assigned: "Erika",
    })).toBe(false);
  });

  it("returns false when match is cancelled", () => {
    expect(shouldEmitReminder({
      isCancelled: true,
      isForfeited: false,
      sr1Assigned: null,
      sr2Assigned: null,
    })).toBe(false);
  });

  it("returns false when match is forfeited", () => {
    expect(shouldEmitReminder({
      isCancelled: false,
      isForfeited: true,
      sr1Assigned: null,
      sr2Assigned: null,
    })).toBe(false);
  });
});
