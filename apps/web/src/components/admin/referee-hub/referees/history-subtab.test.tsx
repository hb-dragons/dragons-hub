// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const getBlob = vi.fn();
vi.mock("@/lib/api", () => ({
  browserClient: { getBlob: (...a: unknown[]) => getBlob(...a) },
  api: {},
}));

const toastError = vi.fn();
const toastWarning = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...a: unknown[]) => toastError(...a),
    warning: (...a: unknown[]) => toastWarning(...a),
  },
}));

import { HistorySubtab } from "./history-subtab";

const ref = { id: 1, apiId: 100, firstName: "A", lastName: "Müller", licenseNumber: 0, matchCount: 0, allowAllHomeGames: true, allowAwayGames: true, isOwnClub: true, createdAt: "", updatedAt: "" };

const item = (n: number, sr1ApiId: number | null, sr2ApiId: number | null) => ({
  id: n, matchId: n, matchNo: 1000 + n, kickoffDate: "2026-04-01", kickoffTime: "18:00",
  homeTeamName: "H", guestTeamName: "G", leagueName: "OL", leagueShort: "OL",
  venueName: null, venueCity: null, sr1OurClub: false, sr2OurClub: false,
  sr1Name: "Foo Müller", sr2Name: "Bar Müller",
  sr1Status: "assigned", sr2Status: "assigned",
  sr1RefereeApiId: sr1ApiId, sr2RefereeApiId: sr2ApiId,
  isCancelled: false, isForfeited: false, isHomeGame: true,
});

vi.mock("swr", () => ({
  default: vi.fn(() => ({
    data: { items: [item(1, 100, 999), item(2, 999, 100)], total: 4, limit: 2, offset: 0, hasMore: true },
  })),
  mutate: vi.fn(),
}));

const messages = { refereeHub: { referees: { history: {
  total: "{n} games",
  exportCsv: "Export",
  exporting: "Exporting…",
  exportFailed: "Export failed",
  exportTruncated: "Only the first rows were exported ({n} total)",
  loadMore: "Load more",
  statusPlayed: "played", statusCancelled: "cancelled", statusForfeited: "forfeited",
  empty: "No games",
} } } };

function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages as never}>{ui}</NextIntlClientProvider>;
}

afterEach(() => cleanup());

describe("HistorySubtab CSV export", () => {
  let created: string[];
  let clicked: HTMLAnchorElement[];
  let realCreate: typeof document.createElement;

  beforeEach(() => {
    created = [];
    clicked = [];
    getBlob.mockReset();
    toastError.mockReset();
    toastWarning.mockReset();
    globalThis.URL.createObjectURL = vi.fn(() => {
      const u = `blob:mock-${created.length}`;
      created.push(u);
      return u;
    });
    globalThis.URL.revokeObjectURL = vi.fn();
    realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === "a") {
        const a = el as HTMLAnchorElement;
        a.click = () => clicked.push(a);
      }
      return el;
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("downloads the CSV through the cross-origin API client, not a same-origin /api/ link", async () => {
    getBlob.mockResolvedValue({
      blob: new Blob(["a,b\n"], { type: "text/csv" }),
      headers: new Headers({ "X-Total-Count": "4" }),
    });
    render(wrap(<HistorySubtab referee={ref} />));

    // The old implementation rendered <a href="/api/admin/..."> which 404s:
    // apps/web has no app/api route and next.config declares no rewrites.
    expect(
      document.querySelector('a[href^="/api/"]'),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    await waitFor(() => expect(getBlob).toHaveBeenCalledTimes(1));
    expect(getBlob.mock.calls[0]![0]).toBe(
      "/admin/referee/history/games.csv?refereeApiId=100&limit=50&offset=0",
    );
    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(clicked[0]!.download).toMatch(/\.csv$/);
    expect(clicked[0]!.href).toBe(created[0]);
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith(created[0]);
  });

  it("warns when the API reports the export was truncated", async () => {
    getBlob.mockResolvedValue({
      blob: new Blob(["a,b\n"], { type: "text/csv" }),
      headers: new Headers({
        "X-Total-Count": "2500",
        "X-Result-Truncated": "true",
      }),
    });
    render(wrap(<HistorySubtab referee={ref} />));

    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    await waitFor(() =>
      expect(toastWarning).toHaveBeenCalledWith(
        "Only the first rows were exported (2500 total)",
      ),
    );
  });

  it("surfaces an error toast when the download fails", async () => {
    getBlob.mockRejectedValue(new Error("403"));
    render(wrap(<HistorySubtab referee={ref} />));

    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Export failed"));
    expect(clicked).toHaveLength(0);
  });
});

describe("HistorySubtab", () => {
  it("derives SR1/SR2 from apiId match, not name substring", () => {
    render(wrap(<HistorySubtab referee={ref} />));
    const rows = screen.getAllByText(/H vs G/);
    expect(rows[0].parentElement?.textContent).toMatch(/SR1/);
    expect(rows[1].parentElement?.textContent).toMatch(/SR2/);
  });

  it("renders Load more when hasMore is true", () => {
    render(wrap(<HistorySubtab referee={ref} />));
    expect(screen.getByRole("button", { name: /load more/i })).toBeEnabled();
  });
});
