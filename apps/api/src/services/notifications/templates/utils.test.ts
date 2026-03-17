import { describe, expect, it } from "vitest";
import { formatDate } from "./utils";

describe("formatDate", () => {
  it("formats date as DD.MM. for German locale", () => {
    expect(formatDate("2026-04-15", "de")).toBe("15.04.");
  });

  it("formats date as MM/DD for English locale", () => {
    expect(formatDate("2026-04-15", "en")).toBe("04/15");
  });

  it("returns the input string for malformed dates", () => {
    expect(formatDate("invalid", "de")).toBe("invalid");
  });

  it("returns the input string for empty string", () => {
    expect(formatDate("", "de")).toBe("");
  });

  it("handles single-segment date string", () => {
    expect(formatDate("2026", "de")).toBe("2026");
  });

  it("handles two-segment date string", () => {
    expect(formatDate("2026-04", "de")).toBe("2026-04");
  });
});
