// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

vi.mock("swr", () => ({
  default: (_key: unknown, _fetcher: unknown, opts?: { fallbackData?: unknown }) => ({
    data: opts?.fallbackData,
    mutate: vi.fn(),
  }),
  useSWRConfig: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({ api: {} }));
vi.mock("@/lib/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
// RBAC is not what this test is about — always allow.
vi.mock("@/components/rbac/can", () => ({
  Can: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("./match-edit-sheet", () => ({ MatchEditSheet: () => null }));
vi.mock("./match-change-history", () => ({ MatchChangeHistory: () => null }));
vi.mock("./match-divergence-table", () => ({ MatchDivergenceTable: () => null }));
vi.mock("./reschedule-chat-sheet", () => ({
  RescheduleChatSheet: () => <div data-testid="reschedule-sheet" />,
}));

import { MatchDetailPage } from "./match-detail-page";

const messages = {
  common: { back: "Back" },
  matchDetail: {
    matchday: "Matchday {day}",
    edit: "Edit",
    overrideCount: "{count} overrides",
    reschedule: { trigger: "Suggest reschedule" },
    info: {
      title: "Info",
      matchNo: "No",
      matchday: "Matchday",
      league: "League",
      date: "Date",
      time: "Time",
      venue: "Venue",
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

describe("MatchDetailPage reschedule copilot entry point", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    cleanup();
  });

  it("hides the trigger when the assistant is disabled", () => {
    vi.stubEnv("NEXT_PUBLIC_ASSISTANT_ENABLED", "false");
    renderPage();
    // With ASSISTANT_ENABLED off server-side the endpoint 404s/500s, so the
    // sheet could only ever fail silently.
    expect(
      screen.queryByRole("button", { name: "Suggest reschedule" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("reschedule-sheet")).not.toBeInTheDocument();
  });

  it("hides the trigger when the flag is absent entirely", () => {
    vi.stubEnv("NEXT_PUBLIC_ASSISTANT_ENABLED", "");
    renderPage();
    expect(
      screen.queryByRole("button", { name: "Suggest reschedule" }),
    ).not.toBeInTheDocument();
  });

  it("shows the trigger when the assistant is enabled", () => {
    vi.stubEnv("NEXT_PUBLIC_ASSISTANT_ENABLED", "true");
    renderPage();
    expect(
      screen.getByRole("button", { name: "Suggest reschedule" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("reschedule-sheet")).toBeInTheDocument();
  });
});
