// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { RefereeList } from "./referee-list";

const refs = [
  { id: 1, apiId: 100, firstName: "Anna", lastName: "Müller", licenseNumber: 12345, matchCount: 14, allowAllHomeGames: true, allowAwayGames: true, isOwnClub: true, createdAt: "", updatedAt: "" },
  { id: 2, apiId: 101, firstName: "Karl", lastName: "Schmidt", licenseNumber: 33122, matchCount: 9, allowAllHomeGames: false, allowAwayGames: true, isOwnClub: true, createdAt: "", updatedAt: "" },
];

vi.mock("swr", () => ({
  default: vi.fn((key: string) => {
    if (key === "/admin/referees/counts") return { data: { own: 7, all: 23 } };
    return { data: { items: refs, total: 2, limit: 50, offset: 0, hasMore: false } };
  }),
  mutate: vi.fn(),
}));

const setVisibility = vi.fn().mockResolvedValue({});
vi.mock("@/lib/api", () => ({
  api: { refereeAdmin: { setVisibility: (...args: unknown[]) => setVisibility(...args) } },
  APIError: class extends Error {},
}));

vi.mock("../use-referee-hub-url", () => ({
  useRefereeHubUrl: vi.fn(() => ({
    state: { scope: "own", search: "", sort: "name" },
    update: vi.fn(),
  })),
}));

const messages = {
  refereeHub: {
    referees: {
      scope: { own: "Own ({n})", all: "All ({n})" },
      kpi: { ownClubRefs: "Own-club refs", avgMatches: "Avg matches/ref" },
      columns: { ref: "Referee", own: "Own", games: "Games" },
      search: "Search…",
      sort: { name: "Name", workloadDesc: "Games (desc)", workloadAsc: "Games (asc)" },
      empty: "No referees",
    },
  },
};

function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages as never}>{ui}</NextIntlClientProvider>;
}

afterEach(() => { cleanup(); setVisibility.mockClear(); vi.clearAllMocks(); });

describe("RefereeList", () => {
  it("renders referees", () => {
    render(wrap(<RefereeList selectedId={null} onSelect={vi.fn()} />));
    expect(screen.getByText(/Müller/)).toBeInTheDocument();
    expect(screen.getByText(/Schmidt/)).toBeInTheDocument();
  });

  it("invokes onSelect with referee id on row click", () => {
    const onSelect = vi.fn();
    render(wrap(<RefereeList selectedId={null} onSelect={onSelect} />));
    fireEvent.click(screen.getByText(/Müller/));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("fires PATCH on isOwnClub toggle click", async () => {
    render(wrap(<RefereeList selectedId={null} onSelect={vi.fn()} />));
    const toggles = screen.getAllByRole("checkbox", { name: /own/i });
    fireEvent.click(toggles[0]!);
    await waitFor(() => expect(setVisibility).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ isOwnClub: false }),
    ));
  });

  it("does not render role labels", () => {
    render(wrap(<RefereeList selectedId={null} onSelect={() => {}} />));
    expect(screen.getByText("Müller, Anna")).toBeInTheDocument();
    expect(screen.queryByText(/Schiedsrichter|SR1|SR2/)).toBeNull();
  });

  it("renders Own (N) | All (M) chip group from /counts", async () => {
    const useSWR = (await import("swr")).default as ReturnType<typeof vi.fn>;
    useSWR.mockImplementation((key: string) => {
      if (key === "/admin/referees/counts") return { data: { own: 7, all: 23 } } as never;
      return { data: { items: [], total: 0, limit: 50, offset: 0, hasMore: false } } as never;
    });
    render(wrap(<RefereeList selectedId={null} onSelect={() => {}} />));
    expect(screen.getByRole("button", { name: /own \(7\)/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /all \(23\)/i })).toBeInTheDocument();
  });

  it("clicking All chip calls update({ scope: 'all' })", async () => {
    const update = vi.fn();
    const { useRefereeHubUrl } = await import("../use-referee-hub-url");
    (useRefereeHubUrl as ReturnType<typeof vi.fn>).mockReturnValue({
      state: { scope: "own", search: "", sort: "name" },
      update,
    });
    render(wrap(<RefereeList selectedId={null} onSelect={() => {}} />));
    fireEvent.click(screen.getByRole("button", { name: /all/i }));
    expect(update).toHaveBeenCalledWith({ scope: "all" });
  });

  describe("debounced search", () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it("debounces search input by 300ms", async () => {
      const update = vi.fn();
      const { useRefereeHubUrl } = await import("../use-referee-hub-url");
      (useRefereeHubUrl as ReturnType<typeof vi.fn>).mockReturnValue({
        state: { scope: "own", search: "", sort: "name" },
        update,
      });
      render(wrap(<RefereeList selectedId={null} onSelect={() => {}} />));
      await act(async () => {
        fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "mei" } });
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(update).toHaveBeenCalledWith({ search: "mei" });
    });
  });

  it("renders 2 KPI cards (own-club refs, avg matches) and not the old 3-card strip", () => {
    render(wrap(<RefereeList selectedId={null} onSelect={() => {}} />));
    expect(screen.getByText(/own-club refs/i)).toBeInTheDocument();
    expect(screen.getByText(/avg matches\/ref/i)).toBeInTheDocument();
    // Old three-card labels must be gone
    expect(screen.queryByText(/^total games$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^referees$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^avg workload$/i)).not.toBeInTheDocument();
  });
});
