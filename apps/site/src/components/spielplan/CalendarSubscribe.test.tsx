// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CalendarSubscribe } from "./CalendarSubscribe";
import { planGameFixture as game } from "../../lib/full-plan.fixture";
import { teamFilterOptions } from "../../lib/spielplan";
import { strings } from "../../lib/strings";

afterEach(cleanup);

const games = [
  game({ homeTeamCustomName: "Herren 1", homeTeamApiId: 160402 }),
  game({ id: 2, homeTeamCustomName: "Damen 1", homeTeamApiId: 320674, homeBadgeColor: "orange" }),
  game({ id: 3, homeTeamCustomName: "U18", homeTeamApiId: 159888, homeBadgeColor: "cyan" }),
];
const teams = teamFilterOptions(games);

function open(filterSelection: ReadonlySet<string> | null = null) {
  render(
    <CalendarSubscribe
      apiBase="https://api.example"
      games={games}
      teams={teams}
      filterSelection={filterSelection}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: strings.spielplan.subscribe }));
}

const shownUrl = () => new URL(document.querySelector("code")?.textContent ?? "");
const squads = () => shownUrl().searchParams.getAll("teamApiId");

describe("CalendarSubscribe", () => {
  it("shows the club-wide feed URL when no team was chosen anywhere", () => {
    open();
    const url = shownUrl();
    expect(url.origin + url.pathname).toBe("https://api.example/public/schedule.ics");
    expect(url.searchParams.has("teamApiId")).toBe(false);
  });

  it("lists every Dragons team as a checkbox, all ticked by default", () => {
    open();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.map((b) => b.getAttribute("aria-checked"))).toEqual(["true", "true", "true"]);
    expect(screen.getByRole("checkbox", { name: "Damen 1" })).toBeInTheDocument();
  });

  it("starts from the page's team filter", () => {
    open(new Set(["U18"]));
    expect(screen.getByRole("checkbox", { name: "U18" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("checkbox", { name: "Herren 1" })).toHaveAttribute("aria-checked", "false");
    expect(squads()).toEqual(["159888"]);
  });

  it("narrows the feed to the teams ticked inside the popover", () => {
    open();
    fireEvent.click(screen.getByRole("checkbox", { name: "Herren 1" }));
    expect(squads()).toEqual(["320674", "159888"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "U18" }));
    expect(squads()).toEqual(["320674"]);
  });

  it("goes back to the club-wide feed once every team is ticked again", () => {
    open(new Set(["Damen 1"]));
    fireEvent.click(screen.getByRole("checkbox", { name: "Herren 1" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "U18" }));
    expect(squads()).toEqual([]);
  });

  it("copies the URL and confirms it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    open(new Set(["Herren 1"]));
    fireEvent.click(screen.getByRole("button", { name: strings.spielplan.copy }));
    expect(writeText).toHaveBeenCalledWith(
      "https://api.example/public/schedule.ics?teamApiId=160402",
    );
    expect(await screen.findByRole("button", { name: strings.spielplan.copied })).toBeInTheDocument();
  });

  it("lists the per-app instructions", () => {
    open();
    expect(screen.getByText(strings.spielplan.instructionApple, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(strings.spielplan.instructionGoogle, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(strings.spielplan.instructionOutlook, { exact: false })).toBeInTheDocument();
  });
});
