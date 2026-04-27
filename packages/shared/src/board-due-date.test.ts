import { describe, it, expect } from "vitest";
import { dueDateBucket } from "./board-due-date";

const NOW_ISO = "2026-04-27T12:00:00Z";
const NOW = new Date(NOW_ISO);

describe("dueDateBucket", () => {
  it("returns null for null input", () => {
    expect(dueDateBucket(null, NOW)).toBeNull();
  });

  it("returns 'overdue' for any past time", () => {
    expect(dueDateBucket("2026-04-26T23:59:00Z", NOW)).toBe("overdue");
    expect(dueDateBucket("2025-01-01T00:00:00Z", NOW)).toBe("overdue");
  });

  it("returns 'today' for any moment on the same calendar day (UTC)", () => {
    expect(dueDateBucket("2026-04-27T00:00:00Z", NOW)).toBe("today");
    expect(dueDateBucket("2026-04-27T23:59:59Z", NOW)).toBe("today");
  });

  it("returns 'soon' for tomorrow through 3 days out", () => {
    expect(dueDateBucket("2026-04-28T00:00:00Z", NOW)).toBe("soon");
    expect(dueDateBucket("2026-04-30T23:59:59Z", NOW)).toBe("soon");
  });

  it("returns 'later' for >3 days out", () => {
    expect(dueDateBucket("2026-05-01T00:00:00Z", NOW)).toBe("later");
    expect(dueDateBucket("2027-01-01T00:00:00Z", NOW)).toBe("later");
  });

  it("returns null for unparsable input", () => {
    expect(dueDateBucket("not-a-date", NOW)).toBeNull();
  });
});
