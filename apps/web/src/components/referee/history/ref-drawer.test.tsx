// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";

vi.mock("@/hooks/use-referee-history", () => ({
  useRefereeHistoryGames: () => ({ data: undefined }),
}));

const { RefDrawer } = await import("./ref-drawer");

afterEach(cleanup);

const defaultFilters = {
  tab: "workload" as const,
  preset: "season" as const,
  dateFrom: "2025-08-01",
  dateTo: "2026-07-31",
  status: [],
  offset: 0,
  limit: 50 as const,
};

const wrap = (ui: React.ReactElement) => (
  <NextIntlClientProvider locale="en" messages={en}>
    {ui}
  </NextIntlClientProvider>
);

describe("RefDrawer", () => {
  it("renders nothing when entry is null", () => {
    render(wrap(
      <RefDrawer entry={null} filters={defaultFilters}
        ownClubLeaderboard={[]} onClose={() => {}} />,
    ));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(wrap(
      <RefDrawer
        entry={{ refereeApiId: 100, refereeId: 1, displayName: "Mueller",
          isOwnClub: true, sr1Count: 3, sr2Count: 2, total: 5,
          lastRefereedDate: "2026-04-01" }}
        filters={defaultFilters}
        ownClubLeaderboard={[{ refereeApiId: 100, refereeId: 1, displayName: "Mueller",
          isOwnClub: true, sr1Count: 3, sr2Count: 2, total: 5,
          lastRefereedDate: "2026-04-01" }]}
        onClose={onClose}
      />,
    ));
    fireEvent.click(screen.getByTestId("drawer-close"));
    expect(onClose).toHaveBeenCalled();
  });
});
