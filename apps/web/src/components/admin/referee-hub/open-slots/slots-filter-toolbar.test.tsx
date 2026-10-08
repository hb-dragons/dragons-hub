// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { act, cleanup, render, screen, fireEvent } from "@testing-library/react";
import { todayInClubZone, plusDaysInClubZone } from "@dragons/shared";
import { SlotsFilterToolbar } from "./slots-filter-toolbar";

const baseFilters = {
  status: "open" as const,
  league: [] as string[],
  dateFrom: null as string | null,
  dateTo: null as string | null,
  gameType: "both" as const,
  search: "",
};

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, v?: Record<string, unknown>) =>
    v ? `${k}(${Object.values(v).join(",")})` : k,
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const LEAGUES = [
  { value: "101", label: "Region Kreisliga U12 mixed", short: "RKu12mo" },
  { value: "102", label: "Oberliga Herren", short: "OLH" },
];

function renderToolbar(props: Partial<Parameters<typeof SlotsFilterToolbar>[0]> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <SlotsFilterToolbar filters={baseFilters} onChange={onChange} leagueOptions={LEAGUES} total={35} {...props} />,
  );
  return { onChange, ...utils };
}

describe("SlotsFilterToolbar", () => {
  it("draws status, game type and date as radio groups with the current choice checked", () => {
    renderToolbar();
    expect(screen.getByRole("radiogroup", { name: "status" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3 + 3 + 4);
    expect(screen.getByRole("radio", { name: "statusValue.open" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "gameTypeValue.both" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "datePreset.upcoming" })).toHaveAttribute("aria-checked", "true");
  });

  it("reports a picked status and game type", () => {
    const { onChange } = renderToolbar();
    fireEvent.click(screen.getByRole("radio", { name: "statusValue.any" }));
    expect(onChange).toHaveBeenCalledWith({ status: "any" });
    fireEvent.click(screen.getByRole("radio", { name: "gameTypeValue.away" }));
    expect(onChange).toHaveBeenCalledWith({ gameType: "away" });
  });

  it("moves the choice with the arrow keys, wrapping at the ends", () => {
    const { onChange } = renderToolbar();
    const group = screen.getByRole("radiogroup", { name: "status" });
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith({ status: "offered" });
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith({ status: "any" });
    onChange.mockClear();
    fireEvent.keyDown(group, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("applies a date preset as a concrete range", () => {
    const { onChange } = renderToolbar();
    fireEvent.click(screen.getByRole("radio", { name: "datePreset.30d" }));
    expect(onChange).toHaveBeenCalledWith({ dateFrom: todayInClubZone(), dateTo: plusDaysInClubZone(30) });
    fireEvent.click(screen.getByRole("radio", { name: "datePreset.custom" }));
    expect(onChange).toHaveBeenCalledWith({ dateFrom: todayInClubZone(), dateTo: todayInClubZone() });
    fireEvent.click(screen.getByRole("radio", { name: "datePreset.upcoming" }));
    expect(onChange).toHaveBeenCalledWith({ dateFrom: null, dateTo: null });
  });

  it("recognises the 14-day preset from its range", () => {
    renderToolbar({ filters: { ...baseFilters, dateFrom: todayInClubZone(), dateTo: plusDaysInClubZone(14) } });
    expect(screen.getByRole("radio", { name: "datePreset.14d" })).toHaveAttribute("aria-checked", "true");
  });

  it("shows the two date pickers only for a custom range", () => {
    const { rerender, onChange } = renderToolbar();
    expect(screen.queryByLabelText("dateFrom")).not.toBeInTheDocument();

    rerender(
      <SlotsFilterToolbar
        filters={{ ...baseFilters, dateFrom: "2026-01-05", dateTo: "2026-02-01" }}
        onChange={onChange}
        leagueOptions={LEAGUES}
        total={35}
      />,
    );
    expect(screen.getByRole("radio", { name: "datePreset.custom" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("dateFrom")).toHaveTextContent("05.01.2026");
    expect(screen.getByLabelText("dateTo")).toHaveTextContent("01.02.2026");
  });

  it("lists the leagues in a menu and toggles them", async () => {
    const { onChange } = renderToolbar();
    fireEvent.pointerDown(screen.getByRole("button", { name: "league" }), { button: 0, ctrlKey: false });

    const item = await screen.findByRole("menuitemcheckbox", { name: /Oberliga Herren/ });
    fireEvent.click(item);
    expect(onChange).toHaveBeenCalledWith({ league: ["102"] });

    cleanup();
    const again = vi.fn();
    render(
      <SlotsFilterToolbar
        filters={{ ...baseFilters, league: ["102"] }}
        onChange={again}
        leagueOptions={LEAGUES}
        total={35}
      />,
    );
    const trigger = screen.getByRole("button", { name: "leagueSelected(1)" });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: /Oberliga Herren/ }));
    expect(again).toHaveBeenCalledWith({ league: [] });
  });

  it("says so when no league has open games", async () => {
    renderToolbar({ leagueOptions: [] });
    fireEvent.pointerDown(screen.getByRole("button", { name: "league" }), { button: 0, ctrlKey: false });
    expect(await screen.findByText("noLeagues")).toBeInTheDocument();
  });

  it("offers Reset only once something is filtered, and it restores every default", () => {
    const { rerender, onChange } = renderToolbar();
    expect(screen.queryByRole("button", { name: /reset/ })).not.toBeInTheDocument();

    rerender(
      <SlotsFilterToolbar
        filters={{ ...baseFilters, gameType: "home", search: "dra" }}
        onChange={onChange}
        leagueOptions={LEAGUES}
        total={35}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /reset/ }));
    expect(onChange).toHaveBeenCalledWith({
      status: "open",
      league: [],
      dateFrom: null,
      dateTo: null,
      gameType: "both",
      search: "",
    });
  });

  it("shows the result count once it is known", () => {
    const { rerender, onChange } = renderToolbar({ total: null });
    expect(screen.queryByText(/resultCount/)).not.toBeInTheDocument();
    rerender(<SlotsFilterToolbar filters={baseFilters} onChange={onChange} leagueOptions={LEAGUES} total={35} />);
    expect(screen.getByText("resultCount(35)")).toBeInTheDocument();
  });

  it("reports typed search text once, after the debounce, and follows the URL back", async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { rerender } = render(
      <SlotsFilterToolbar filters={baseFilters} onChange={onChange} leagueOptions={LEAGUES} total={35} />,
    );

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "dra" } });
    expect(onChange).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ search: "dra" });

    // The write lands in the URL, then Back clears it: the input follows the
    // URL both times without echoing another write.
    rerender(<SlotsFilterToolbar filters={{ ...baseFilters, search: "dra" }} onChange={onChange} leagueOptions={LEAGUES} total={35} />);
    expect(input).toHaveValue("dra");
    rerender(<SlotsFilterToolbar filters={baseFilters} onChange={onChange} leagueOptions={LEAGUES} total={35} />);
    expect(input).toHaveValue("");
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
