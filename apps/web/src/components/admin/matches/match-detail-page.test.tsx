// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const mocks = vi.hoisted(() => ({
  alternativeDates: vi.fn(),
  editSheet: vi.fn(),
}));

vi.mock("swr", () => ({
  default: (_key: unknown, _fetcher: unknown, opts?: { fallbackData?: unknown }) => ({
    data: opts?.fallbackData,
    mutate: vi.fn(),
  }),
  useSWRConfig: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({
  api: { matches: { alternativeDates: mocks.alternativeDates } },
}));
vi.mock("@/lib/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
// RBAC is not what this test is about — always allow.
vi.mock("@/components/rbac/can", () => ({
  Can: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
// Stands in for the sheet so the page's own wiring — whether it is open, and
// with which picked day — is what the assertions read. The sheet's handling of
// that day has its own tests.
vi.mock("./match-edit-sheet", () => ({
  MatchEditSheet: (props: unknown) => {
    mocks.editSheet(props);
    return null;
  },
}));
vi.mock("./match-change-history", () => ({ MatchChangeHistory: () => null }));
vi.mock("./match-divergence-table", () => ({ MatchDivergenceTable: () => null }));

import { MatchDetailPage } from "./match-detail-page";

const messages = {
  common: { back: "Back", loading: "Loading" },
  errors: {
    title: "Something went wrong",
    description: "An unexpected error occurred.",
    tryAgain: "Try again",
  },
  hallTimes: {
    title: "Hall times",
    closedNote: "Hall closed{note, select, none {} other {: {note}}}",
    coverage: {
      covered: "Hall time covered",
      partial: "Hall time partial",
      uncovered: "Outside hall time",
      closed: "Hall closed",
      none: "No hall time",
    },
  },
  matchDetail: {
    alternativeDates: {
      trigger: "Find alternative dates",
      title: "Alternative dates",
      back: "Back to the game",
      caveats: {
        opponentGamesOutsideTrackedLeagues:
          "Games of the opponent outside the leagues we track are unknown.",
      },
      from: "From",
      to: "To",
      homeGame: "Home game",
      awayGame: "Away game",
      groups: {
        fits: "Fits a held hall time",
        notHeld: "No hall time held",
        away: "Away",
      },
      hallTime: "Hall time {start} – {end}",
      awayVenue: "Hall: opponent",
      currentVenue: "current hall",
      noHalls: "None of our halls has a hall time.",
      game: "{start} – {end} {home} – {guest}",
      noFit: "Game does not fit",
      suggestedKickoff: "Suggested kickoff: {time}",
      loading: "Searching for dates…",
      flags: {
        outsideRoundWindow: "Outside the round window",
        coachCollision: "Trainer also with {team}",
      },
      empty: "No free weekend day in this range.",
      error: "The alternative dates could not be loaded.",
      copy: "Copy as text",
      copyHeader:
        "Possible alternative dates for {home} – {guest} ({league}, matchday {matchDay}):",
      copied: "Alternative dates copied.",
      copyFailed: "Copying was not possible.",
    },
    matchday: "Matchday {day}",
    edit: "Edit",
    overrideCount: "{count} overrides",
    info: {
      title: "Info",
      matchNo: "No",
      matchday: "Matchday",
      league: "League",
      date: "Date",
      time: "Time",
      venue: "Venue",
      matchdaySummary: "Matchday {day} · {league}",
    },
    score: { title: "Score", final: "Final", halftime: "Halftime" },
    status: { confirmed: "Confirmed", forfeited: "Forfeited", cancelled: "Cancelled" },
    referees: { title: "Referees", open: "Open" },
    hallCoverage: {
      title: "Hall time",
      window: "Window needed: {start} – {end}",
      games: "{count, plural, one {# game} other {# games}} that day",
    },
  },
};

const detail = {
  match: {
    id: 1,
    matchNo: 7,
    matchDay: 3,
    leagueName: "OL",
    kickoffDate: "2026-04-01",
    kickoffTime: "18:00",
    venueName: "Gym",
    venueNameOverride: null,
    homeTeamName: "H",
    guestTeamName: "G",
    homeScore: null,
    guestScore: null,
    homeHalftimeScore: null,
    guestHalftimeScore: null,
    isConfirmed: false,
    isForfeited: false,
    isCancelled: false,
    overrides: [],
    refereeSlots: [],
    hallCoverage: null,
  },
  diffs: [],
};

function renderPage() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MatchDetailPage
        matchId={1}
        initialDetail={detail as never}
        initialHistory={{ entries: [], total: 0 } as never}
      />
    </NextIntlClientProvider>,
  );
}

/**
 * The app pins every formatter to Europe/Berlin (see i18n/request.ts), so the
 * anchor has to survive being built in a different runtime zone — a UTC SSR
 * container, or an admin travelling. Never assert this under Europe/Berlin:
 * that is the one zone where the old midnight anchor looked right.
 */
const formats = {
  dateTime: {
    matchDate: { weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit" },
    matchTime: { hour: "2-digit", minute: "2-digit" },
  },
} as const;

function renderPageInBerlin() {
  return render(
    <NextIntlClientProvider
      locale="de"
      timeZone="Europe/Berlin"
      messages={messages}
      formats={formats}
    >
      <MatchDetailPage
        matchId={1}
        initialDetail={detail as never}
        initialHistory={{ entries: [], total: 0 } as never}
      />
    </NextIntlClientProvider>,
  );
}

describe("MatchDetailPage kickoff date anchor", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    cleanup();
  });

  it.each(["UTC", "America/New_York", "Pacific/Kiritimati", "Pacific/Honolulu"])(
    "renders the match's own Berlin calendar day (TZ=%s)",
    (tz) => {
      vi.stubEnv("TZ", tz);
      renderPageInBerlin();
      // detail.match.kickoffDate is 2026-04-01.
      expect(screen.getByText(/01\.04\.26/)).toBeInTheDocument();
    },
  );
});

describe("MatchDetailPage alternative-date finder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.alternativeDates.mockResolvedValue({
      isHomeGame: true,
      caveats: [],
      range: { from: "2026-08-01", to: "2026-09-30" },
      candidates: [
        {
          date: "2026-08-15",
          weekday: "saturday",
          group: "fits",
          halls: [
            {
              venueId: 1,
              venueName: "Drachenhalle",
              isCurrentVenue: true,
              hallTime: { kind: "open", startTime: "10:00", endTime: "20:00", note: null },
              games: [],
              existing: null,
              fits: true,
              suggestedKickoffTime: "17:00:00",
            },
          ],
          flags: [],
        },
      ],
    });
  });

  afterEach(() => {
    cleanup();
  });

  async function openFinder() {
    renderPageInBerlin();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Find alternative dates" }));
    });
  }

  it("offers the finder beside the edit button, under the same gate", () => {
    renderPageInBerlin();

    const trigger = screen.getByRole("button", { name: "Find alternative dates" });
    const edit = screen.getByRole("button", { name: "Edit" });

    expect(trigger.parentElement).toBe(edit.parentElement);
  });

  it("shows the candidate days for this match", async () => {
    await openFinder();

    expect(mocks.alternativeDates).toHaveBeenCalledWith(1, undefined);
    expect(
      screen.getByRole("heading", { name: "Fits a held hall time", hidden: true }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Suggested kickoff/)).toBeInTheDocument();
  });

  it("opens the edit sheet on the picked day and its suggested kickoff", async () => {
    await openFinder();

    await act(async () => {
      fireEvent.click(screen.getByText(/Suggested kickoff/).closest("button")!);
    });

    expect(mocks.editSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        open: true,
        prefill: { date: "2026-08-15", time: "17:00:00" },
      }),
    );
    // The finder is done: the sheet, not the panel, is what is on screen now.
    expect(screen.queryByText(/Suggested kickoff/)).not.toBeInTheDocument();
  });

  it("drops the picked day when its sheet closes", async () => {
    await openFinder();
    await act(async () => {
      fireEvent.click(screen.getByText(/Suggested kickoff/).closest("button")!);
    });

    // The sheet closes itself — the X, a discarded edit, a failed load.
    const { onOpenChange } = mocks.editSheet.mock.lastCall![0] as {
      onOpenChange: (open: boolean) => void;
    };
    await act(async () => {
      onOpenChange(false);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    });

    expect(mocks.editSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: true, prefill: null }),
    );
  });
});

function renderWithCoverage(hallCoverage: unknown) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MatchDetailPage
        matchId={1}
        initialDetail={{ ...detail, match: { ...detail.match, hallCoverage } } as never}
        initialHistory={{ entries: [], total: 0 } as never}
      />
    </NextIntlClientProvider>,
  );
}

describe("MatchDetailPage hall coverage", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the hall time, the window the games need and the game count", () => {
    renderWithCoverage({
      hallTime: { kind: "open", startTime: "08:00", endTime: "17:00", note: null },
      coverage: "partial",
      gapBeforeMinutes: 0,
      gapAfterMinutes: 30,
      windowStart: "09:00:00",
      windowEnd: "17:30:00",
      gameCount: 2,
    });
    expect(screen.getByText("Hall time partial")).toHaveAttribute("data-coverage", "partial");
    expect(screen.getByText("Hall times: 08:00 – 17:00")).toBeInTheDocument();
    expect(
      screen.getByText("Window needed: 09:00 – 17:30 · 2 games that day"),
    ).toBeInTheDocument();
  });

  it("names the closure on a closed day", () => {
    renderWithCoverage({
      hallTime: { kind: "closed", startTime: null, endTime: null, note: "Ferien" },
      coverage: "closed",
      gapBeforeMinutes: 0,
      gapAfterMinutes: 0,
      windowStart: "09:00:00",
      windowEnd: "12:30:00",
      gameCount: 1,
    });
    expect(screen.getByText("Hall closed")).toHaveAttribute("data-coverage", "closed");
    expect(screen.getByText("Hall closed: Ferien")).toBeInTheDocument();
  });

  it("flags a day with no hall time at all", () => {
    renderWithCoverage({
      hallTime: null,
      coverage: "none",
      gapBeforeMinutes: 0,
      gapAfterMinutes: 0,
      windowStart: "09:00:00",
      windowEnd: "12:30:00",
      gameCount: 1,
    });
    expect(screen.getByText("No hall time")).toHaveAttribute("data-coverage", "none");
  });

  it("shows no hall card for a game without coverage", () => {
    renderWithCoverage(null);
    expect(screen.queryByText("Hall time partial")).not.toBeInTheDocument();
    expect(screen.queryByText(/Window needed/)).not.toBeInTheDocument();
  });
});
