import { describe, expect, it } from "vitest";
import { resolveVenueId } from "./venue-selection";

describe("resolveVenueId", () => {
  const selected = { id: 11, label: "Sporthalle Nord" };

  it("returns the id while the text still names the selected venue", () => {
    expect(resolveVenueId(selected, "Sporthalle Nord")).toBe(11);
  });

  it("ignores surrounding whitespace", () => {
    expect(resolveVenueId(selected, "  Sporthalle Nord ")).toBe(11);
  });

  it("drops the id once the text is edited away from the selection", () => {
    expect(resolveVenueId(selected, "Sporthalle Nordwest")).toBeNull();
    expect(resolveVenueId(selected, "")).toBeNull();
    expect(resolveVenueId(selected, null)).toBeNull();
  });

  it("returns null when nothing was ever selected", () => {
    expect(resolveVenueId(null, "Sporthalle Nord")).toBeNull();
    expect(resolveVenueId(undefined, "Sporthalle Nord")).toBeNull();
  });
});
