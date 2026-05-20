import { describe, it, expect } from "vitest";
import { SURFACES, visibleSurfaces, SURFACE_GROUP_ORDER } from "./nav-surfaces";

const admin = { role: "admin" };
const venue = { role: "venueManager" };
const refereePlain = { role: null, refereeId: 42 };

describe("visibleSurfaces", () => {
  it("returns nothing for anonymous users", () => {
    expect(visibleSurfaces(null)).toEqual([]);
  });
  it("gives admin every surface", () => {
    expect(visibleSurfaces(admin).map((s) => s.id).sort()).toEqual(
      SURFACES.map((s) => s.id).sort(),
    );
  });
  it("scopes venue manager to venue/booking/match surfaces", () => {
    const ids = visibleSurfaces(venue).map((s) => s.id);
    expect(ids).toContain("venues");
    expect(ids).toContain("bookings");
    expect(ids).not.toContain("users");
    expect(ids).not.toContain("sync");
  });
  it("shows officiating to a plain referee via canViewOpenGames", () => {
    const ids = visibleSurfaces(refereePlain).map((s) => s.id);
    expect(ids).toContain("officiating");
    expect(ids).not.toContain("settings");
  });
  it("every surface belongs to a known group", () => {
    for (const s of SURFACES) {
      expect(SURFACE_GROUP_ORDER).toContain(s.group);
    }
  });
});
