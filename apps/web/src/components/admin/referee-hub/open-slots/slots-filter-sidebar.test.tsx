// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { SlotsFilterSidebar } from "./slots-filter-sidebar";

const baseFilters = {
  status: "open" as const,
  league: [] as string[],
  dateFrom: null as string | null,
  dateTo: null as string | null,
  gameType: "both" as const,
};

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
}));

afterEach(() => cleanup());

describe("SlotsFilterSidebar", () => {
  it("calls onChange with status when radio changes", () => {
    const onChange = vi.fn();
    render(<SlotsFilterSidebar filters={baseFilters} onChange={onChange} leagueOptions={[]} />);
    fireEvent.click(screen.getByLabelText(/offered/i));
    expect(onChange).toHaveBeenCalledWith({ status: "offered" });
  });

  it("calls onChange with gameType when checkbox toggles", () => {
    const onChange = vi.fn();
    render(<SlotsFilterSidebar filters={baseFilters} onChange={onChange} leagueOptions={[]} />);
    fireEvent.click(screen.getByLabelText(/away/i));
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

  it("Reset button restores defaults", () => {
    const onChange = vi.fn();
    render(<SlotsFilterSidebar filters={{ ...baseFilters, gameType: "home" }} onChange={onChange} leagueOptions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    expect(onChange).toHaveBeenCalledWith({
      status: "open",
      league: [],
      dateFrom: null,
      dateTo: null,
      gameType: "both",
    });
  });
});
