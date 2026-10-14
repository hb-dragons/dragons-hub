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
  bookings: {
    status: {
      pending: "Pending",
      requested: "Requested",
      confirmed: "Confirmed",
      cancelled: "Cancelled",
    },
  },
  errors: {
    title: "Something went wrong",
    description: "An unexpected error occurred.",
    tryAgain: "Try again",
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
        booked: "With a hall booking",
        unbooked: "Without a hall booking",
        away: "Away",
      },
      noBooking: "no booking",
      awayVenue: "Hall: opponent",
      needsReconfirmation: "Needs re-confirmation",
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
    booking: { title: "Booking", needsReconfirmation: "Needs reconfirmation" },
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
    booking: null,
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
          group: "booked",
          bookings: [
            {
              id: 1,
              effectiveStartTime: "10:00:00",
              effectiveEndTime: "16:00:00",
              status: "confirmed",
              needsReconfirmation: false,
            },
          ],
          suggestedKickoffTime: "17:00:00",
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
      screen.getByRole("heading", { name: "With a hall booking", hidden: true }),
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
