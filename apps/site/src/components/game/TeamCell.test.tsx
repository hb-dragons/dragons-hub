// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("../../lib/api", () => ({ API_BASE: "https://api.example" }));

import { TeamCell } from "./TeamCell";
import { planGameFixture as game } from "../../lib/full-plan.fixture";

afterEach(cleanup);

describe("TeamCell", () => {
  it("renders the own side as its colored team badge, linked to the team page", () => {
    render(<TeamCell game={game()} side="home" />);
    const badge = screen.getByText("Herren 1");
    expect(badge.className).toContain("bg-rose-100");
    expect(badge.closest("a")).toHaveAttribute("href", "/teams/herren-1/");
  });

  it("renders the opponent as a small club logo plus its plain-colored name", () => {
    render(<TeamCell game={game()} side="guest" />);
    const name = screen.getByText("CVJM Hannover 2");
    expect(name.className).not.toContain("text-muted-foreground");
    const logo = screen.getByRole("img", { name: "CVJM Hannover 2" });
    expect(logo).toHaveAttribute(
      "src",
      "https://api.example/public/assets/clubs/4213.webp",
    );
  });

  it("renders badges on both sides of a derby, with no opponent logo", () => {
    const derby = game({
      guestIsOwnClub: true,
      guestTeamCustomName: "Herren 2",
      guestBadgeColor: "teal",
    });
    render(
      <>
        <TeamCell game={derby} side="home" />
        <TeamCell game={derby} side="guest" />
      </>,
    );
    expect(screen.getByText("Herren 1").className).toContain("bg-rose-100");
    expect(screen.getByText("Herren 2").className).toContain("bg-teal-100");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders the own side as the Dragons crest plus label in label mode", () => {
    render(<TeamCell game={game()} side="home" ownAs="label" />);
    const label = screen.getByText("Dragons");
    expect(label.className).not.toContain("text-primary");
    expect(screen.getByRole("img", { name: "Dragons" })).toHaveAttribute(
      "src",
      "/img/logo.svg",
    );
    expect(screen.queryByText("Herren 1")).toBeNull();
  });
});
