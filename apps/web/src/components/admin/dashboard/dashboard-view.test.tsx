// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import useSWR from "swr";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useFormatter: () => ({ dateTime: (d: Date) => d.toISOString().slice(0, 10) }),
}));

vi.mock("@/lib/navigation", () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode }) => (
    <a {...rest}>{children}</a>
  ),
}));

// The dashboard must not depend on the client session: the admin layout already
// resolved it server-side. Keep the client session permanently empty so any
// reliance on it renders a blank dashboard and fails these tests.
const useSessionMock = vi.fn(() => ({ data: undefined }));
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => useSessionMock() },
}));

vi.mock("swr", async (importActual) => {
  const actual = await importActual<typeof import("swr")>();
  return { ...actual, default: vi.fn(actual.default) };
});

import { DashboardView } from "./dashboard-view";

const ADMIN = { id: "u1", role: "admin", refereeId: null };

type SwrResult = { data?: unknown; error?: unknown; isLoading?: boolean; mutate?: () => void };

/** Drive every useSWR call in the component from one factory keyed by cache key. */
function mockSwr(resultFor: (key: string) => SwrResult) {
  vi.mocked(useSWR).mockImplementation(((key: unknown) => {
    const result = typeof key === "string" ? resultFor(key) : { data: undefined };
    return {
      data: undefined,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      ...result,
    };
  }) as never);
}

describe("<DashboardView>", () => {
  beforeEach(() => {
    vi.mocked(useSWR).mockReset();
    useSessionMock.mockClear();
  });
  afterEach(cleanup);

  it("renders permission-gated content from the server-resolved session", () => {
    mockSwr(() => ({ data: undefined }));
    render(<DashboardView user={ADMIN} />);
    // An admin can view referees; the KPI must be on screen on the very first
    // paint, without waiting for a client-side session round trip.
    expect(screen.getByText("kpi.referees")).toBeInTheDocument();
    expect(useSessionMock).not.toHaveBeenCalled();
  });

  it("never shows a healthy sync indicator when the sync status is unknown", () => {
    mockSwr((key) =>
      key === "/admin/sync/status"
        ? { data: undefined, error: new Error("boom") }
        : { data: undefined },
    );
    render(<DashboardView user={ADMIN} />);

    const indicator = screen.getByTestId("sync-indicator");
    expect(indicator).toHaveAttribute("data-sync-state", "unknown");
    expect(indicator.className).not.toContain("bg-primary");
    expect(screen.queryByText("quickLinks.syncHealthy")).not.toBeInTheDocument();
  });

  it("shows a healthy sync indicator only when a successful sync is known", () => {
    mockSwr((key) =>
      key === "/admin/sync/status"
        ? { data: { lastSync: { status: "completed" } } }
        : { data: undefined },
    );
    render(<DashboardView user={ADMIN} />);
    expect(screen.getByTestId("sync-indicator")).toHaveAttribute(
      "data-sync-state",
      "healthy",
    );
  });

  it("renders an error state with a retry affordance when the API fails", async () => {
    const mutate = vi.fn();
    mockSwr(() => ({ data: undefined, error: new Error("down"), mutate }));
    render(<DashboardView user={ADMIN} />);

    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    const retry = screen.getAllByRole("button", { name: /tryAgain/i })[0]!;
    fireEvent.click(retry);
    expect(mutate).toHaveBeenCalled();
  });

  it("does not claim there are no urgent tasks when the data failed to load", () => {
    mockSwr(() => ({ data: undefined, error: new Error("down") }));
    render(<DashboardView user={ADMIN} />);
    expect(screen.queryByText("urgentTasks.noTasks")).not.toBeInTheDocument();
  });

  it("does not claim there are no urgent tasks while still loading", () => {
    mockSwr(() => ({ data: undefined, isLoading: true }));
    render(<DashboardView user={ADMIN} />);
    expect(screen.queryByText("urgentTasks.noTasks")).not.toBeInTheDocument();
    expect(screen.queryByText("todaySchedule.noMatches")).not.toBeInTheDocument();
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  });

  it("renders real values once the data arrives", () => {
    mockSwr((key) => {
      if (key.startsWith("/admin/referees?")) return { data: { total: 12, items: [] } };
      if (key === "/admin/matches?limit=1&offset=0") return { data: { total: 7, items: [] } };
      if (key === "/admin/teams") return { data: [{ id: 1 }, { id: 2 }] };
      if (key === "/admin/sync/status") return { data: { lastSync: { status: "completed" } } };
      return { data: undefined };
    });
    render(<DashboardView user={ADMIN} />);
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  /** Today's schedule row for one match, with whatever venue fields are given. */
  function renderTodayMatch(venue: {
    venueName: string | null;
    venueNameOverride: string | null;
  }) {
    mockSwr((key) =>
      key.startsWith("/admin/matches?dateFrom=")
        ? {
            data: {
              total: 1,
              items: [
                {
                  id: 1,
                  kickoffTime: "19:30",
                  homeTeamName: "Dragons",
                  guestTeamName: "Rivals",
                  leagueName: "Oberliga",
                  anschreiber: null,
                  ...venue,
                },
              ],
            },
          }
        : { data: undefined },
    );
    render(<DashboardView user={ADMIN} />);
  }

  it("shows the admin's venue override rather than the federation venue", () => {
    // An override exists precisely because the federation value is wrong, so
    // every surface must prefer it. Reading `venueName ?? venueNameOverride`
    // pins the dashboard to the stale federation value forever.
    renderTodayMatch({
      venueName: "Federation Hall",
      venueNameOverride: "Corrected Gym",
    });

    expect(screen.getByText(/Corrected Gym/)).toBeInTheDocument();
    expect(screen.queryByText(/Federation Hall/)).not.toBeInTheDocument();
  });

  it("falls back to the federation venue when no override is set", () => {
    renderTodayMatch({ venueName: "Federation Hall", venueNameOverride: null });

    expect(screen.getByText(/Federation Hall/)).toBeInTheDocument();
  });
});
