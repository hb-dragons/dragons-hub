// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { TeamBadge } from "./team-badge";

function classesFor(name: string, badgeColor?: string | null): string[] {
  render(<TeamBadge name={name} badgeColor={badgeColor} />);
  const badge = screen.getByText(name);
  const classes = [...badge.classList];
  cleanup();
  return classes;
}

describe("<TeamBadge>", () => {
  afterEach(cleanup);

  it("renders one team the same way on every surface", () => {
    // Matches, bookings and reconcile all render through this component. The
    // bug this replaces was bookings dropping badgeColor, which silently
    // reassigned the team a hash-derived colour on that screen only.
    const inMatches = classesFor("Dragons U18", "violet");
    const inBookings = classesFor("Dragons U18", "violet");

    expect(inBookings).toEqual(inMatches);
    expect(inMatches).toContain("bg-violet-100");
  });

  it("carries both colour schemes rather than pinning itself to one", () => {
    // "admin always uses dark mode" was never true — a light-mode admin got
    // dark badge fills. A badge must ship the light classes plus the dark:
    // variants so the browser picks.
    const classes = classesFor("TV Buchholz", "blue");

    expect(classes).toContain("bg-blue-100");
    expect(classes).toContain("text-blue-800");
    expect(classes).toContain("dark:bg-blue-800");
    expect(classes).toContain("dark:text-blue-100");
  });

  it("falls back to a stable name-derived colour when none is configured", () => {
    expect(classesFor("Unconfigured TV")).toEqual(classesFor("Unconfigured TV"));
  });
});
