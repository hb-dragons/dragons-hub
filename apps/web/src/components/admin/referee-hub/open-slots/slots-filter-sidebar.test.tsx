// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { todayInClubZone, plusDaysInClubZone } from "@dragons/shared";
import { SlotsFilterSidebar } from "./slots-filter-sidebar";

const baseFilters = {
  status: "open" as const,
  league: [] as string[],
  dateFrom: null as string | null,
  dateTo: null as string | null,
  gameType: "both" as const,
  search: "",
};

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
}));

afterEach(() => cleanup());

describe("SlotsFilterSidebar", () => {
  it("calls onChange with status when a status option is picked", () => {
    const onChange = vi.fn();
    render(<SlotsFilterSidebar filters={baseFilters} onChange={onChange} leagueOptions={[]} />);
    fireEvent.click(screen.getByLabelText(/statusValue\.offered/));
    expect(onChange).toHaveBeenCalledWith({ status: "offered" });
  });

  it("renders status and date choices with the shared radio control, not native inputs", () => {
    render(<SlotsFilterSidebar filters={baseFilters} onChange={() => {}} leagueOptions={[]} />);
    // 3 status + 4 date presets
    expect(screen.getAllByRole("radio")).toHaveLength(7);
    expect(document.querySelector('input[type="radio"]')).toBeNull();
    expect(document.querySelector('input[type="date"]')).toBeNull();
    expect(screen.getByRole("radio", { name: /statusValue\.open/ })).toHaveAttribute("data-state", "checked");
    expect(screen.getByRole("radio", { name: /datePreset\.season/ })).toHaveAttribute("data-state", "checked");
  });

  it("calls onChange with gameType when checkbox toggles", () => {
    const onChange = vi.fn();
    render(<SlotsFilterSidebar filters={baseFilters} onChange={onChange} leagueOptions={[]} />);
    fireEvent.click(screen.getByLabelText(/gameTypeValue\.away/));
    expect(onChange).toHaveBeenCalledWith({ gameType: "away" });
  });

  it("renders league checkboxes from options", () => {
    render(
      <SlotsFilterSidebar
        filters={baseFilters}
        onChange={() => {}}
        leagueOptions={[{ value: "OL", label: "Oberliga" }, { value: "BL", label: "Bundesliga" }]}
      />,
    );
    expect(screen.getByLabelText("Oberliga")).toBeInTheDocument();
    expect(screen.getByLabelText("Bundesliga")).toBeInTheDocument();
  });

  it("applies a date preset as a concrete range", () => {
    const onChange = vi.fn();
    render(<SlotsFilterSidebar filters={baseFilters} onChange={onChange} leagueOptions={[]} />);
    fireEvent.click(screen.getByLabelText(/datePreset\.30d/));
    expect(onChange).toHaveBeenCalledWith({ dateFrom: todayInClubZone(), dateTo: plusDaysInClubZone(30) });
  });

  it("shows the two date pickers only for a custom range", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <SlotsFilterSidebar filters={baseFilters} onChange={onChange} leagueOptions={[]} />,
    );
    expect(screen.queryByLabelText("dateFrom")).not.toBeInTheDocument();

    rerender(
      <SlotsFilterSidebar
        filters={{ ...baseFilters, dateFrom: "2026-01-05", dateTo: "2026-02-01" }}
        onChange={onChange}
        leagueOptions={[]}
      />,
    );
    expect(screen.getByRole("radio", { name: /datePreset\.custom/ })).toHaveAttribute("data-state", "checked");
    expect(screen.getByLabelText("dateFrom")).toHaveTextContent("05.01.2026");
    expect(screen.getByLabelText("dateTo")).toHaveTextContent("01.02.2026");
  });

  it("Reset restores every default and is disabled while nothing is filtered", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <SlotsFilterSidebar filters={baseFilters} onChange={onChange} leagueOptions={[]} />,
    );
    expect(screen.getByRole("button", { name: /reset/i })).toBeDisabled();

    rerender(<SlotsFilterSidebar filters={{ ...baseFilters, gameType: "home", search: "dra" }} onChange={onChange} leagueOptions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    expect(onChange).toHaveBeenCalledWith({
      status: "open",
      league: [],
      dateFrom: null,
      dateTo: null,
      gameType: "both",
      search: "",
    });
  });
});
