// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { TeamBadge, teamSlug } from "./TeamBadge";
import { teamBadgeClassName } from "./team-badge-classes";

// First component test in this package (#268). Until the coverage rescoping
// that landed with it, no .tsx file was inside either the test or the coverage
// glob, so every island and every presentational component was invisible to
// the gate.

afterEach(cleanup);

describe("teamSlug", () => {
  it("lowercases and hyphenates the first space, matching the legacy rule", () => {
    expect(teamSlug("Damen 1")).toBe("damen-1");
    expect(teamSlug("U18")).toBe("u18");
  });

  // The legacy rule replaces only the FIRST space; a longer name keeps the rest.
  it("leaves later spaces alone", () => {
    expect(teamSlug("Herren 1 Reserve")).toBe("herren-1 reserve");
  });
});

describe("TeamBadge", () => {
  it("links one of our teams to its team page", () => {
    render(<TeamBadge teamName="Damen 1" isDragonsTeam />);
    const link = screen.getByRole("link", { name: "Damen 1 Team" });
    expect(link).toHaveAttribute("href", "/teams/damen-1/");
    expect(link).toHaveTextContent("Damen 1");
  });

  // Legacy behaviour: an opponent's badge is a recruiting link, not a dead end.
  it("links an opponent to Probetraining", () => {
    render(<TeamBadge teamName="CVJM Hannover 2" />);
    expect(screen.getByRole("link", { name: "CVJM Hannover 2 Team" })).toHaveAttribute(
      "href",
      "/probetraining/",
    );
  });

  it("renders a bare badge with no link when the link is disabled", () => {
    render(<TeamBadge teamName="U16" disableLink />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("U16")).toBeInTheDocument();
  });

  // The colour must come from the configured preset, not the name hash, or a
  // team's badge changes colour depending on which surface renders it.
  it("prefers the configured preset over the name hash", () => {
    render(<TeamBadge teamName="Damen 2" badgeColor="teal" disableLink />);
    const classes = screen.getByText("Damen 2").className;
    expect(classes).toContain(teamBadgeClassName("teal", "Damen 2"));
    expect(classes).not.toContain(teamBadgeClassName(null, "Damen 2"));
  });

  it("falls back to the name hash when no preset is configured", () => {
    render(<TeamBadge teamName="Damen 2" disableLink />);
    expect(screen.getByText("Damen 2").className).toContain(teamBadgeClassName(null, "Damen 2"));
  });
});
