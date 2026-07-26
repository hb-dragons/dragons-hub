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
  common: {
    cancel: "Cancel",
    close: "Close",
    release: "Release",
    reset: "Reset",
    saveChanges: "Save Changes",
  },
  matches: { title: "Matches" },
  matchDetail: {
    overrideActive: "Override active",
    discard: "Discard",
    discardTitle: "Discard changes?",
    discardDescription: "Unsaved changes will be lost.",
    info: {
      title: "Match Info",
      matchday: "Matchday",
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
