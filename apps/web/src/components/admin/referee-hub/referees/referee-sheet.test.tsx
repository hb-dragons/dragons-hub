// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { RefereeSheet } from "./referee-sheet";

vi.mock("swr", () => ({
  default: vi.fn(),
  mutate: vi.fn(),
}));
vi.mock("../use-referee-hub-url", () => ({
  useRefereeHubUrl: () => ({ state: { subtab: "profile" }, update: vi.fn() }),
}));

const messages = { errors: { title: "Something went wrong", description: "An unexpected error occurred.", tryAgain: "Try again" }, refereeHub: { referees: {
  licenseLabel: "Lic {number}", apiIdLabel: "API {id}",
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

describe("RefereeSheet", () => {
  it("fetches by id via /admin/referees/:id", async () => {
    const useSWR = (await import("swr")).default;
    vi.mocked(useSWR).mockReturnValue({ data: { id: 1, firstName: "Anna", lastName: "Müller", apiId: 100, licenseNumber: 12345, isOwnClub: true, matchCount: 14 } } as never);
    render(wrap(<RefereeSheet refereeId={1} onClose={() => {}} />));
    expect(useSWR).toHaveBeenCalledWith("/admin/referees/1", expect.any(Function));
    expect(screen.getByText(/Müller, Anna/)).toBeInTheDocument();
  });

  it("renders notFound message when SWR returns null", async () => {
    const useSWR = (await import("swr")).default;
    vi.mocked(useSWR).mockReturnValue({ data: null, isLoading: false } as never);
    render(wrap(<RefereeSheet refereeId={999} onClose={() => {}} />));
    expect(screen.getByText(/Referee not found/)).toBeInTheDocument();
  });

  it("renders loading message when SWR is in-flight (data undefined)", async () => {
    const useSWR = (await import("swr")).default;
    vi.mocked(useSWR).mockReturnValue({ data: undefined, isLoading: true } as never);
    render(wrap(<RefereeSheet refereeId={42} onClose={() => {}} />));
    expect(screen.getByText(/Loading…/)).toBeInTheDocument();
    expect(screen.queryByText(/Referee not found/)).not.toBeInTheDocument();
  });

  it("renders the Rules tab as enabled for non-own-club refs (subtab shows CTA instead)", async () => {
    const useSWR = (await import("swr")).default;
    vi.mocked(useSWR).mockReturnValue({ data: { id: 1, firstName: "A", lastName: "B", apiId: 1, licenseNumber: 0, isOwnClub: false, matchCount: 0 }, isLoading: false } as never);
    render(wrap(<RefereeSheet refereeId={1} onClose={() => {}} />));
    expect(screen.getByRole("tab", { name: /rules/i })).not.toBeDisabled();
  });

  it("names the referee as the sheet's title, with licence and federation id", async () => {
    const useSWR = (await import("swr")).default;
    vi.mocked(useSWR).mockReturnValue({ data: { id: 1, firstName: "Anna", lastName: "Müller", apiId: 100, licenseNumber: 12345, isOwnClub: true, matchCount: 14 } } as never);
    render(wrap(<RefereeSheet refereeId={1} onClose={() => {}} />));
    expect(screen.getByRole("dialog", { name: "Müller, Anna" })).toBeInTheDocument();
    expect(screen.getByText("Lic 12345 · API 100")).toBeInTheDocument();
    expect(screen.getByText("Own club")).toBeInTheDocument();
  });

  it("shows a failed load as an error with retry, not as 'not found'", async () => {
    const useSWR = (await import("swr")).default;
    const mutate = vi.fn();
    vi.mocked(useSWR).mockReturnValue({ data: undefined, error: new Error("down"), isLoading: false, mutate } as never);
    render(wrap(<RefereeSheet refereeId={1} onClose={() => {}} />));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mutate).toHaveBeenCalled();
  });

  it("stays closed without a referee and fetches nothing", async () => {
    const useSWR = (await import("swr")).default;
    render(wrap(<RefereeSheet refereeId={null} onClose={() => {}} />));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(useSWR).not.toHaveBeenCalled();
  });

  it("closes through onClose", async () => {
    const useSWR = (await import("swr")).default;
    vi.mocked(useSWR).mockReturnValue({ data: { id: 1, firstName: "A", lastName: "B", apiId: 1, licenseNumber: 0, isOwnClub: false, matchCount: 0 } } as never);
    const onClose = vi.fn();
    render(wrap(<RefereeSheet refereeId={1} onClose={onClose} />));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
