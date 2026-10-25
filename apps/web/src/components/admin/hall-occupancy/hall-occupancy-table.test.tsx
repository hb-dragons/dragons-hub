// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { HallOccupancyDay } from "@dragons/shared";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import { SWR_KEYS } from "@/lib/swr-keys";

const mocks = vi.hoisted(() => ({
  days: [] as unknown[],
  keys: [] as unknown[],
  error: undefined as unknown,
}));

vi.mock("swr", () => ({
  default: (key: unknown) => {
    mocks.keys.push(key);
    return { data: mocks.days, error: mocks.error, isLoading: false, mutate: vi.fn() };
  },
}));
vi.mock("@/lib/api", () => ({ api: {} }));
vi.mock("@/lib/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { HallOccupancyTable } from "./hall-occupancy-table";

const formats = {
  dateTime: {
    matchDate: { weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit" },
    matchTime: { hour: "2-digit", minute: "2-digit" },
  },
} as const;

function game(over: Partial<HallOccupancyDay["games"][number]> = {}): HallOccupancyDay["games"][number] {
  return {
    matchId: 501,
    kickoffTime: "18:00:00",
    endTime: "20:00:00",
    homeTeam: "Dragons U16",
    homeTeamCustomName: null,
    homeBadgeColor: null,
    guestTeam: "TSV Gast",
    leagueName: "Oberliga",
    ...over,
  };
}

function day(over: Partial<HallOccupancyDay> = {}): HallOccupancyDay {
  return {
    venueId: 7,
    venueName: "Gymnasium Goetheschule",
    date: "2026-11-14",
    windowStart: "17:30:00",
    windowEnd: "20:00:00",
    games: [game()],
    hallTime: { kind: "open", startTime: "17:00", endTime: "21:00", note: null },
    coverage: "covered",
    gapBeforeMinutes: 0,
    gapAfterMinutes: 0,
    ...over,
  };
}

function renderTable(locale: "de" | "en" = "de") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      timeZone="Europe/Berlin"
      messages={locale === "de" ? de : en}
      formats={formats}
    >
      <HallOccupancyTable />
    </NextIntlClientProvider>,
  );
}

beforeAll(() => {
  // Radix Select needs these in happy-dom.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  cleanup();
  mocks.days = [];
  mocks.keys = [];
  mocks.error = undefined;
});

describe("HallOccupancyTable", () => {
  it("renders date, hall, games, window, hall time and coverage", () => {
    mocks.days = [day()];
    renderTable();
    const row = screen.getAllByRole("row")[1]!;
    expect(within(row).getByText(/14\.11\.26/)).toBeInTheDocument();
    expect(within(row).getByText("Gymnasium Goetheschule")).toBeInTheDocument();
    expect(within(row).getByText("Dragons U16")).toBeInTheDocument();
    expect(within(row).getByText(/TSV Gast/)).toBeInTheDocument();
    expect(within(row).getByText(/18:00/)).toBeInTheDocument();
    expect(within(row).getByText("17:30 – 20:00")).toBeInTheDocument();
    expect(within(row).getByText("17:00 – 21:00")).toBeInTheDocument();
    expect(within(row).getByText("Hallenzeit gedeckt")).toBeInTheDocument();
  });

  it("shows the closed note, or Keine Hallenzeit when none is held", () => {
    mocks.days = [
      day({
        hallTime: { kind: "closed", startTime: null, endTime: null, note: "Ferien" },
        coverage: "closed",
      }),
      day({ venueId: 8, venueName: "Sporthalle Nord", hallTime: null, coverage: "none" }),
    ];
    renderTable();
    expect(screen.getByText("Geschlossen: Ferien")).toBeInTheDocument();
    // Hall time cell and the "none" coverage badge share the wording.
    expect(screen.getAllByText("Keine Hallenzeit")).toHaveLength(2);
  });

  it("spells out the gap in German and English", () => {
    mocks.days = [day({ coverage: "partial", gapBeforeMinutes: 30, gapAfterMinutes: 45 })];
    renderTable("de");
    expect(screen.getByText("30 Min. zu früh")).toBeInTheDocument();
    expect(screen.getByText("45 Min. zu spät")).toBeInTheDocument();
    cleanup();
    renderTable("en");
    expect(screen.getByText("30 min early")).toBeInTheDocument();
    expect(screen.getByText("45 min late")).toBeInTheDocument();
  });

  it("links each game to its match and the hall to its Hallenzeiten panel", () => {
    mocks.days = [day({ games: [game({ matchId: 501 }), game({ matchId: 502, kickoffTime: "19:00:00" })] })];
    renderTable();
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toContain("/admin/matches/501");
    expect(links).toContain("/admin/matches/502");
    expect(links).toContain("/admin/venues?hallTimes=7");
  });

  it("uses the custom team name when set", () => {
    mocks.days = [day({ games: [game({ homeTeamCustomName: "Dragons Weiß" })] })];
    renderTable();
    expect(screen.getByText("Dragons Weiß")).toBeInTheDocument();
  });

  it("offers no create, edit or reconcile controls", () => {
    mocks.days = [day()];
    renderTable();
    expect(screen.queryByRole("button", { name: /neu|anlegen|abgleich|bearbeiten|create|edit|reconcile/i })).toBeNull();
  });

  it("shows the empty state", () => {
    mocks.days = [];
    renderTable();
    expect(screen.getByText(de.hallOccupancy.empty)).toBeInTheDocument();
  });

  it("changes the SWR key when the hall filter changes", () => {
    mocks.days = [day(), day({ venueId: 8, venueName: "Sporthalle Nord" })];
    renderTable();
    expect(mocks.keys).toContain(SWR_KEYS.hallOccupancy({}));
    fireEvent.keyDown(screen.getByRole("combobox", { name: de.hallOccupancy.filters.hall }), { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("option", { name: "Sporthalle Nord" }));
    expect(mocks.keys).toContain(SWR_KEYS.hallOccupancy({ venueId: 8 }));
  });

  it("changes the SWR key when the coverage filter changes", () => {
    mocks.days = [day()];
    renderTable();
    fireEvent.keyDown(screen.getByRole("combobox", { name: de.hallOccupancy.filters.coverage }), { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("option", { name: "Außerhalb der Hallenzeit" }));
    expect(mocks.keys).toContain(SWR_KEYS.hallOccupancy({ coverage: "uncovered" }));
  });

  it("offers only halls present in the occupancy data, not every venue", () => {
    mocks.days = [day(), day({ venueId: 8, venueName: "Sporthalle Nord" })];
    renderTable();
    fireEvent.keyDown(screen.getByRole("combobox", { name: de.hallOccupancy.filters.hall }), { key: "ArrowDown" });
    const names = screen.getAllByRole("option").map((o) => o.textContent);
    expect(names).toEqual([de.hallOccupancy.filters.allHalls, "Gymnasium Goetheschule", "Sporthalle Nord"]);
    expect(mocks.keys).not.toContain("/admin/venues");
  });

  it("changes the SWR key when a date is picked", () => {
    mocks.days = [day()];
    renderTable();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(de.hallOccupancy.filters.from) }));
    fireEvent.click(screen.getAllByRole("gridcell").find((c) => c.textContent === "15")!.querySelector("button")!);
    expect(mocks.keys.some((k) => typeof k === "string" && /dateFrom=\d{4}-\d{2}-15/.test(k))).toBe(true);
  });
});
