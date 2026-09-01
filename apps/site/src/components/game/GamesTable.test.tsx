// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../lib/api", () => ({ API_BASE: "https://api.example" }));
vi.mock("../spielplan/XlsxExport", () => ({ exportSpielplanXlsx: vi.fn() }));

import { GamesTable } from "./GamesTable";
import { planGameFixture as game } from "../../lib/full-plan.fixture";
import { strings } from "../../lib/strings";

afterEach(cleanup);

describe("GamesTable", () => {
  it("renders one row per game with date, time, result and venue", () => {
    render(<GamesTable games={[game({ homeScore: 72, guestScore: 46 })]} />);
    expect(screen.getByText("Sa., 05.09.26")).toBeInTheDocument();
    expect(screen.getByText("18:00")).toBeInTheDocument();
    expect(screen.getByText("72:46")).toBeInTheDocument();
    expect(screen.getByText("Goetheschule")).toBeInTheDocument();
  });

  it("renders the own side as its badge and the opponent with a club logo", () => {
    render(<GamesTable games={[game()]} />);
    expect(screen.getByText("Herren 1").className).toContain("bg-rose-100");
    expect(screen.getByRole("img", { name: "CVJM Hannover 2" })).toBeInTheDocument();
  });

  it("renders the own side as the Dragons label in label mode", () => {
    render(<GamesTable games={[game()]} ownAs="label" />);
    expect(screen.getByText("Dragons")).toBeInTheDocument();
    expect(screen.queryByText("Herren 1")).toBeNull();
  });

  it("tints the row of an own home game", () => {
    render(<GamesTable games={[game()]} />);
    const row = screen.getByText("Goetheschule").closest("tr");
    expect(row?.className).toContain("bg-green-800/10");
  });

  it("flips the row order when the date header is toggled", () => {
    render(
      <GamesTable
        games={[
          game({ id: 1, kickoffDate: "2026-09-13", venueName: "Erste Halle" }),
          game({ id: 2, kickoffDate: "2026-10-04", venueName: "Zweite Halle" }),
        ]}
      />,
    );
    const rowsBefore = screen.getAllByText(/^(?:Erste|Zweite) Halle$/).map((el) => el.textContent);
    expect(rowsBefore).toEqual(["Erste Halle", "Zweite Halle"]);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(strings.teams.colDate) }));
    const rowsAfter = screen.getAllByText(/^(?:Erste|Zweite) Halle$/).map((el) => el.textContent);
    expect(rowsAfter).toEqual(["Zweite Halle", "Erste Halle"]);
  });

  it("shows the empty row and disables the export without games", () => {
    render(<GamesTable games={[]} />);
    expect(screen.getByText(strings.spielplan.noGame)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: new RegExp(strings.spielplan.exportLabel) }),
    ).toBeDisabled();
  });

  it("shows the game count in the footer", () => {
    render(<GamesTable games={[game(), game({ id: 2 })]} />);
    expect(screen.getByText(`2 ${strings.spielplan.gamesCount}`)).toBeInTheDocument();
  });
});
