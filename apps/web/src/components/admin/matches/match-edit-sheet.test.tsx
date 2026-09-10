// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Sheet } from "@dragons/ui/components/sheet";
import type { MatchDetail } from "@dragons/shared";

const mocks = vi.hoisted(() => ({
  getMatch: vi.fn(),
  updateMatch: vi.fn(),
  releaseOverride: vi.fn(),
  searchVenues: vi.fn(),
  listTeams: vi.fn(),
  alternativeDates: vi.fn(),
  refresh: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    matches: {
      get: mocks.getMatch,
      update: mocks.updateMatch,
      releaseOverride: mocks.releaseOverride,
      alternativeDates: mocks.alternativeDates,
    },
    venues: { search: mocks.searchVenues },
    teams: { list: mocks.listTeams },
  },
}));

vi.mock("@/lib/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: "u1", role: "admin" } } }),
  },
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

import { MatchEditSheet } from "./match-edit-sheet";

function makeMatch(): MatchDetail {
  return {
    id: 7,
    apiMatchId: 700,
    matchNo: 12,
    matchDay: 3,
    kickoffDate: "2026-08-01",
    kickoffTime: "18:00",
    homeTeamApiId: 1,
    homeTeamName: "Dragons",
    homeTeamNameShort: null,
    homeTeamCustomName: null,
    homeClubId: 1,
    guestTeamApiId: 2,
    guestTeamName: "Bears",
    guestTeamNameShort: null,
    guestTeamCustomName: null,
    guestClubId: 2,
    homeIsOwnClub: true,
    guestIsOwnClub: false,
    homeBadgeColor: null,
    guestBadgeColor: null,
    homeScore: null,
    guestScore: null,
    leagueId: 1,
    leagueName: "Oberliga",
    venueId: 5,
    venueName: "Halle Alt",
    venueStreet: null,
    venuePostalCode: null,
    venueCity: null,
    venueNameOverride: null,
    isConfirmed: false,
    isForfeited: false,
    isCancelled: false,
    anschreiber: null,
    zeitnehmer: null,
    shotclock: null,
    publicComment: null,
    hasLocalChanges: false,
    overriddenFields: [],
    booking: null,
    homeHalftimeScore: null,
    guestHalftimeScore: null,
    periodFormat: null,
    homeQ1: null, guestQ1: null,
    homeQ2: null, guestQ2: null,
    homeQ3: null, guestQ3: null,
    homeQ4: null, guestQ4: null,
    homeQ5: null, guestQ5: null,
    homeQ6: null, guestQ6: null,
    homeQ7: null, guestQ7: null,
    homeQ8: null, guestQ8: null,
    homeOt1: null, guestOt1: null,
    homeOt2: null, guestOt2: null,
    internalNotes: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    overrides: [],
  };
}

const messages = {
  errors: {
    title: "Something went wrong",
    description: "An unexpected error occurred.",
    tryAgain: "Try again",
  },
  common: {
    cancel: "Cancel",
    close: "Close",
    release: "Release",
    reset: "Reset",
    saveChanges: "Save Changes",
  },
  matches: { title: "Matches" },
  bookings: {
    status: {
      pending: "Pending",
      requested: "Requested",
      confirmed: "Confirmed",
      cancelled: "Cancelled",
    },
  },
  matchDetail: {
    overrideActive: "Override active",
    discard: "Discard",
    discardTitle: "Discard changes?",
    discardDescription: "Unsaved changes will be lost.",
    editTitle: "{home} vs {guest}",
    info: {
      title: "Match Info",
      matchday: "Matchday",
      matchdaySummary: "Matchday {day} · {league}",
      matchNo: "Match No",
      league: "League",
      venue: "Venue",
    },
    status: {
      title: "Status",
      confirmed: "Confirmed",
      forfeited: "Forfeited",
      cancelled: "Cancelled",
      noFlags: "None",
    },
    score: { halftime: "HT", final: "Final" },
    overrides: {
      title: "Overrides",
      official: "Official",
      date: "Date",
      time: "Time",
      forfeited: "Forfeited",
      cancelled: "Cancelled",
      venue: "Venue",
      venuePlaceholder: "Search venue...",
    },
    staff: {
      title: "Officials",
      setAll: "Set all",
      placeholder: "Select",
      anschreiber: "Anschreiber",
      zeitnehmer: "Zeitnehmer",
      shotclock: "Shotclock",
      clear: "Clear {role}",
    },
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
      empty: "No free weekend day in this range.",
      error: "The alternative dates could not be loaded.",
    },
    booking: { title: "Booking", needsReconfirmation: "Needs reconfirmation" },
    notes: {
      title: "Notes",
      internal: "Internal",
      internalDescription: "Internal only",
      public: "Public",
      publicDescription: "Shown publicly",
    },
    toast: {
      loadFailed: "Load failed",
      updated: "Updated",
      updateFailed: "Update failed",
      overrideReleased: "Released",
      overrideReleaseFailed: "Release failed",
    },
  },
};

const formats = {
  dateTime: {
    matchDate: {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    },
    matchTime: { hour: "2-digit", minute: "2-digit" },
  },
} as const;

function wrap(ui: React.ReactNode) {
  return (
    <NextIntlClientProvider
      locale="en"
      timeZone="UTC"
      messages={messages}
      formats={formats}
    >
      <Sheet open onOpenChange={() => {}}>
        {ui}
      </Sheet>
    </NextIntlClientProvider>
  );
}

function venueInput() {
  return screen.getByPlaceholderText("Search venue...");
}

async function renderSheet() {
  const utils = render(
    wrap(<MatchEditSheet matchId={7} open onOpenChange={() => {}} />),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return utils;
}

async function typeVenue(text: string) {
  fireEvent.change(venueInput(), { target: { value: text } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
}

async function submit() {
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: /Save Changes/, hidden: true }),
    );
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("MatchEditSheet venue override", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    const match = makeMatch();
    mocks.getMatch.mockResolvedValue({ match, diffs: [] });
    mocks.updateMatch.mockResolvedValue({ match, diffs: [] });
    mocks.listTeams.mockResolvedValue([]);
    mocks.searchVenues.mockImplementation(({ q }: { q: string }) => {
      const all = [
        { id: 11, name: "Sporthalle Nord", street: null, city: "Berlin" },
        { id: 22, name: "Sporthalle Sued", street: null, city: "Berlin" },
      ];
      return Promise.resolve({
        venues: all.filter((v) =>
          v.name.toLowerCase().includes(q.toLowerCase()),
        ),
      });
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("sends venueId with the venue picked from the list", async () => {
    await renderSheet();
    await typeVenue("Sporthalle Nord");
    fireEvent.click(screen.getByText("Sporthalle Nord"));
    await submit();

    expect(mocks.updateMatch).toHaveBeenCalledWith(7, {
      venueNameOverride: "Sporthalle Nord",
      venueId: 11,
    });
  });

  it("drops the venueId when the name is typed over after selecting", async () => {
    await renderSheet();
    await typeVenue("Sporthalle Nord");
    fireEvent.click(screen.getByText("Sporthalle Nord"));

    // Free-text edit: the user no longer means the venue they picked.
    await typeVenue("Turnhalle am Park");
    await submit();

    expect(mocks.updateMatch).toHaveBeenCalledWith(7, {
      venueNameOverride: "Turnhalle am Park",
    });
    const body = mocks.updateMatch.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body).not.toHaveProperty("venueId");
  });
});

/**
 * Every FieldLabel in the sheet used to be a bare <label> with no htmlFor, so
 * a screen reader announced the controls unnamed and clicking a label did
 * nothing. These assert the association survives, keyed on the accessible name
 * rather than on the ids, which are useId()-generated and unstable.
 */
describe("MatchEditSheet field labelling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    const match = makeMatch();
    mocks.getMatch.mockResolvedValue({ match, diffs: [] });
    mocks.listTeams.mockResolvedValue([]);
    mocks.searchVenues.mockResolvedValue({ venues: [] });
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it.each([
    ["Date", "button"],
    ["Venue", "textbox"],
    ["Anschreiber", "combobox"],
    ["Zeitnehmer", "combobox"],
    ["Shotclock", "combobox"],
    ["Internal", "textbox"],
    ["Public", "textbox"],
  ])("names the %s control through its label", async (label, role) => {
    await renderSheet();
    expect(
      screen.getByRole(role, { name: label, hidden: true }),
    ).toBeInTheDocument();
  });

  it("names the forfeited and cancelled switches", async () => {
    await renderSheet();
    for (const name of ["Forfeited", "Cancelled"]) {
      expect(
        screen.getByRole("switch", { name, hidden: true }),
      ).toBeInTheDocument();
    }
  });

  it("points a field's aria-describedby at its own error message", async () => {
    await renderSheet();
    const notes = screen.getByRole("textbox", { name: "Internal", hidden: true });
    const describedBy = notes.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    // The description is present even with no error; the error id joins it only
    // once react-hook-form reports one, so it must not be dangling here.
    for (const id of describedBy!.split(" ")) {
      expect(document.getElementById(id)).not.toBeNull();
    }
  });
});

/**
 * The "official" hint re-renders the federation's kickoff date. It must name
 * the federation's Berlin calendar day whatever zone the process runs in — the
 * app pins every formatter to Europe/Berlin, but SSR runs UTC and admins
 * travel. Asserting under Europe/Berlin would prove nothing.
 */
function wrapInBerlin(ui: React.ReactNode) {
  return (
    <NextIntlClientProvider
      locale="de"
      timeZone="Europe/Berlin"
      messages={messages}
      formats={formats}
    >
      <Sheet open onOpenChange={() => {}}>
        {ui}
      </Sheet>
    </NextIntlClientProvider>
  );
}

describe("MatchEditSheet official kickoff date hint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    const match = { ...makeMatch(), overriddenFields: ["kickoffDate"] };
    mocks.getMatch.mockResolvedValue({ match, diffs: [] });
    mocks.listTeams.mockResolvedValue([]);
    mocks.searchVenues.mockResolvedValue({ venues: [] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    cleanup();
  });

  it.each(["UTC", "America/New_York", "Pacific/Kiritimati", "Pacific/Honolulu"])(
    "names the federation's own day (TZ=%s)",
    async (tz) => {
      vi.stubEnv("TZ", tz);
      render(wrapInBerlin(<MatchEditSheet matchId={7} open onOpenChange={() => {}} />));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      // makeMatch().kickoffDate is 2026-08-01.
      expect(screen.getByText(/Official: .*01\.08\.26/)).toBeInTheDocument();
    },
  );
});

describe("MatchEditSheet alternative-date finder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    const match = makeMatch();
    mocks.getMatch.mockResolvedValue({ match, diffs: [] });
    mocks.listTeams.mockResolvedValue([]);
    mocks.alternativeDates.mockResolvedValue({
      isHomeGame: true,
      caveats: ["opponentGamesOutsideTrackedLeagues"],
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
        },
      ],
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  async function openFinder() {
    await renderSheet();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Find alternative dates", hidden: true }),
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  it("offers the finder next to the date and time fields", async () => {
    await renderSheet();

    const trigger = screen.getByRole("button", {
      name: "Find alternative dates",
      hidden: true,
    });
    const dateField = screen.getByText("Date").closest("[data-slot=field]");

    expect(trigger).toBeInTheDocument();
    expect(dateField?.parentElement?.parentElement).toContainElement(trigger);
  });

  it("replaces the sheet body with the finder and comes back on the back arrow", async () => {
    await openFinder();

    expect(screen.queryByText("Overrides")).not.toBeInTheDocument();
    expect(mocks.alternativeDates).toHaveBeenCalledWith(7, undefined);
    expect(screen.getAllByRole("listitem", { hidden: true })).toHaveLength(1);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Back to the game", hidden: true }));
    });

    expect(screen.getByText("Overrides")).toBeInTheDocument();
    expect(screen.queryByText("Alternative dates")).not.toBeInTheDocument();
  });

  it("shows the hall booking behind a candidate inside the sheet", async () => {
    await openFinder();

    expect(
      screen.getByRole("heading", { name: "With a hall booking", hidden: true }),
    ).toBeInTheDocument();
    // The window itself is asserted where the provider pins the club zone, as
    // production does; this sheet renders in UTC.
    expect(screen.getByText(/Confirmed/, { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText(/Suggested kickoff/)).toBeInTheDocument();
  });

  it("keeps the sheet title while the finder is open", async () => {
    await openFinder();

    expect(screen.getByText("Dragons vs Bears")).toBeInTheDocument();
  });

  it("returns to the form with every edit intact", async () => {
    await renderSheet();
    const notes = screen.getByLabelText("Internal", { selector: "textarea" });
    fireEvent.change(notes, { target: { value: "Gegner hat abgesagt" } });

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Find alternative dates", hidden: true }),
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Back to the game", hidden: true }));
    });

    expect(screen.getByLabelText("Internal", { selector: "textarea" })).toHaveValue(
      "Gegner hat abgesagt",
    );
  });
});
