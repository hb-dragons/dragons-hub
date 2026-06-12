// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { RefereeDetail } from "./referee-detail";

vi.mock("swr", () => ({
  default: vi.fn(),
  mutate: vi.fn(),
}));
vi.mock("../use-referee-hub-url", () => ({
  useRefereeHubUrl: () => ({ state: { subtab: "profile" }, update: vi.fn() }),
}));

const messages = { refereeHub: { referees: {
  loading: "Loading…",
  notFound: "Referee not found",
  ownClubBadge: "Own club",
  subtabs: { profile: "Profile", rules: "Rules", upcoming: "Upcoming", history: "History" },
  rules: { disabledHint: "Mark as own club first" },
  profile: {
    visibility: { title: "Visibility", ownClub: "Own-club referee", allHome: "Allow all home games", away: "Allow away games" },
    save: { saving: "Saving…", saved: "Saved {n}s ago", dirty: "Unsaved changes", error: "Save failed", now: "Save now" },
  },
} } };

function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages as never}>{ui}</NextIntlClientProvider>;
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); });

describe("RefereeDetail", () => {
  it("fetches by id via /admin/referees/:id", async () => {
    const useSWR = (await import("swr")).default;
    vi.mocked(useSWR).mockReturnValue({ data: { id: 1, firstName: "Anna", lastName: "Müller", apiId: 100, licenseNumber: 12345, isOwnClub: true, matchCount: 14 } } as never);
    render(wrap(<RefereeDetail refereeId={1} />));
    expect(useSWR).toHaveBeenCalledWith("/admin/referees/1", expect.any(Function));
    expect(screen.getByText(/Müller, Anna/)).toBeInTheDocument();
  });

  it("renders notFound message when SWR returns null", async () => {
    const useSWR = (await import("swr")).default;
    vi.mocked(useSWR).mockReturnValue({ data: null, isLoading: false } as never);
    render(wrap(<RefereeDetail refereeId={999} />));
    expect(screen.getByText(/Referee not found/)).toBeInTheDocument();
  });

  it("renders loading message when SWR is in-flight (data undefined)", async () => {
    const useSWR = (await import("swr")).default;
    vi.mocked(useSWR).mockReturnValue({ data: undefined, isLoading: true } as never);
    render(wrap(<RefereeDetail refereeId={42} />));
    expect(screen.getByText(/Loading…/)).toBeInTheDocument();
    expect(screen.queryByText(/Referee not found/)).not.toBeInTheDocument();
  });

  it("renders the Rules tab as enabled for non-own-club refs (subtab shows CTA instead)", async () => {
    const useSWR = (await import("swr")).default;
    vi.mocked(useSWR).mockReturnValue({ data: { id: 1, firstName: "A", lastName: "B", apiId: 1, licenseNumber: 0, isOwnClub: false, matchCount: 0 }, isLoading: false } as never);
    render(wrap(<RefereeDetail refereeId={1} />));
    expect(screen.getByRole("tab", { name: /rules/i })).not.toBeDisabled();
  });
});
