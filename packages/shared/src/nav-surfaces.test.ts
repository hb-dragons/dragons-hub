import { describe, it, expect } from "vitest";
import { SURFACES, visibleSurfaces, SURFACE_GROUP_ORDER } from "./nav-surfaces";

const admin = { role: "admin" };
const venue = { role: "venueManager" };
const teamManager = { role: "teamManager" };
const coach = { role: "coach" };
const multiRole = { role: "venueManager,teamManager" };
const member = { role: null }; // signed-in, no staff role (member/parent)
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
  it("scopes team manager to league + boards (no operations/system)", () => {
    const ids = visibleSurfaces(teamManager).map((s) => s.id).sort();
    expect(ids).toEqual(["boards", "matches", "standings", "teams"]);
  });
  it("gives the coach seam league view + boards (intentional wide grant)", () => {
    // Coach is granted team/match/standing/board view (see rbac.ts), so it
    // surfaces Boards in Tools. If the coach grant narrows, update this.
    const ids = visibleSurfaces(coach).map((s) => s.id).sort();
    expect(ids).toEqual(["boards", "matches", "standings", "teams"]);
  });
  it("unions surfaces across comma-separated multi-role users", () => {
    const ids = visibleSurfaces(multiRole).map((s) => s.id);
    // teamManager contributes standings/teams; venueManager contributes venues/bookings.
    expect(ids).toContain("standings");
    expect(ids).toContain("teams");
    expect(ids).toContain("venues");
    expect(ids).toContain("bookings");
    expect(ids).not.toContain("users");
    expect(ids).not.toContain("sync");
  });
  it("gives a signed-in member with no staff role nothing", () => {
    expect(visibleSurfaces(member)).toEqual([]);
  });
  it("every surface belongs to a known group", () => {
    for (const s of SURFACES) {
      expect(SURFACE_GROUP_ORDER).toContain(s.group);
    }
  });
});
