// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { GamePlanGhostItem, GamePlanItem, GamePlanMatchItem } from "./types";

const swrState = vi.hoisted(() => ({ items: [] as unknown[] }));

vi.mock("swr", () => ({
  default: (key: string | null) =>
    String(key).startsWith("/admin/matches")
      ? { data: { items: swrState.items, total: 1, limit: 1000, offset: 0, hasMore: false }, mutate: vi.fn() }
      : { data: undefined, mutate: vi.fn() },
  useSWRConfig: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({ api: {} }));
vi.mock("@/lib/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
// The sheet itself is covered elsewhere; here it only reports which game it got.
vi.mock("./match-edit-sheet", () => ({
  MatchEditSheet: ({ matchId }: { matchId: number | null }) =>
    matchId === null ? null : <div data-testid="sheet">{matchId}</div>,
}));

import { MatchListTable } from "./match-list-table";
import de from "@/messages/de.json";
import en from "@/messages/en.json";

const formats = {
  dateTime: {
    matchDate: { weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit" },
    short: { day: "2-digit", month: "2-digit", year: "numeric" },
  },
} as const;

const real: GamePlanMatchItem = {
  kind: "match",
  id: 7, apiMatchId: 70, matchNo: 1, matchDay: 1,
  kickoffDate: "2026-03-21", kickoffTime: "16:00:00",
  homeTeamApiId: 100, homeTeamName: "Dragons Herren", homeTeamNameShort: "Herren 1",
  homeTeamCustomName: null, homeClubId: 1,
  guestTeamApiId: 200, guestTeamName: "Rivals", guestTeamNameShort: null,
  guestTeamCustomName: null, guestClubId: 2,
  homeIsOwnClub: true, guestIsOwnClub: false,
  homeBadgeColor: null, guestBadgeColor: null,
  homeScore: 80, guestScore: 70,
  leagueId: 1, leagueName: "Oberliga",
  venueId: null, venueName: null, venueStreet: null, venuePostalCode: null,
  venueCity: null, venueNameOverride: null,
  isConfirmed: false, isForfeited: false, isCancelled: false,
  anschreiber: "Anna Schreiber", zeitnehmer: "Zeno Zeit", shotclock: "Shot Clock",
  publicComment: null,
  hasLocalChanges: true, overriddenFields: ["kickoffDate", "kickoffTime"],
  booking: { id: 3, status: "confirmed", needsReconfirmation: false },
};

const ghost: GamePlanGhostItem = {
  ...real,
  kind: "ghost",
  kickoffDate: "2026-03-14",
  kickoffTime: "18:00:00",
  effectiveKickoffDate: "2026-03-21",
  effectiveKickoffTime: "16:00:00",
  homeScore: null,
  guestScore: null,
  anschreiber: null,
  zeitnehmer: null,
  shotclock: null,
  booking: null,
  overriddenFields: [],
};

function renderTable(items: GamePlanItem[], locale: "de" | "en" = "de") {
  swrState.items = items;
  return render(
    <NextIntlClientProvider
      locale={locale}
      timeZone="Europe/Berlin"
      messages={locale === "de" ? de : en}
      formats={formats}
    >
      <MatchListTable />
    </NextIntlClientProvider>,
  );
}

function ghostRow(): HTMLElement {
  return screen.getByText(/^Verlegt →/).closest("tr")!;
}

beforeEach(() => {
  // Not Berlin on purpose: the dates must be club days in any runtime zone.
  vi.stubEnv("TZ", "Pacific/Kiritimati");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("MatchListTable ghost entries", () => {
  it("renders the ghost dimmed and italic", () => {
    renderTable([ghost]);

    expect(ghostRow()).toHaveClass("opacity-50", "italic");
  });

  it("shows the official date and time and a badge naming the effective kickoff", () => {
    renderTable([ghost]);
    const row = within(ghostRow());

    expect(row.getByText(/14\.03\.26/)).toBeInTheDocument();
    expect(row.getByText("18:00")).toBeInTheDocument();
    expect(row.getByText("Verlegt → Sa 21.03. 16:00")).toBeInTheDocument();
  });

  it("uses the English badge text", () => {
    renderTable([ghost], "en");

    expect(screen.getByText("Moved → Sat 21.03. 16:00")).toBeInTheDocument();
  });

  it("shows teams as usual", () => {
    renderTable([ghost]);
    const row = within(ghostRow());

    expect(row.getByText("Herren 1")).toBeInTheDocument();
    expect(row.getByText("Rivals")).toBeInTheDocument();
  });

  it("leaves the crew columns and the override dots blank", () => {
    // Crew values on the item are ignored even if the API ever sent them.
    renderTable([{ ...ghost, anschreiber: "X", overriddenFields: ["kickoffDate"] }]);
    const row = ghostRow();

    expect(within(row).queryByText("X")).not.toBeInTheDocument();
    expect(row.querySelector(".bg-heat")).toBeNull();
  });

  it("renders the real row alongside the ghost, undimmed", () => {
    renderTable([ghost, real]);

    const realRow = screen.getByText("Anna Schreiber").closest("tr")!;
    expect(realRow).not.toHaveClass("opacity-50");
    expect(within(realRow).queryByText(/Verlegt →/)).not.toBeInTheDocument();
  });

  it("opens the real game's sheet on click", () => {
    renderTable([ghost]);

    fireEvent.click(ghostRow());

    expect(screen.getByTestId("sheet")).toHaveTextContent("7");
  });

  it("carries no buttons of its own", () => {
    renderTable([ghost]);

    // The row itself is the one clickable element.
    expect(within(ghostRow()).queryAllByRole("button")).toEqual([]);
  });
});
