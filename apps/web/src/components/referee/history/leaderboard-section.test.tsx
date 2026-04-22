// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { LeaderboardSection } from "./leaderboard-section";
import en from "@/messages/en.json";
import type { HistoryLeaderboardEntry } from "@dragons/shared";

afterEach(cleanup);

const wrap = (ui: React.ReactElement) => (
  <NextIntlClientProvider locale="en" messages={en}>{ui}</NextIntlClientProvider>
);

const entry = (o: Partial<HistoryLeaderboardEntry> = {}): HistoryLeaderboardEntry => ({
  refereeApiId: 100, refereeId: 1, displayName: "Mueller, A",
  isOwnClub: true, sr1Count: 2, sr2Count: 1, total: 3,
  lastRefereedDate: "2026-04-01", ...o,
});

describe("LeaderboardSection", () => {
  it("renders workload bar for own-club variant", () => {
    render(wrap(<LeaderboardSection
      variant="own" rows={[entry({ total: 10 }), entry({ refereeApiId: 101, total: 5 })]}
      onSelect={() => {}}
    />));
    expect(screen.getAllByTestId("workload-bar-fill").length).toBe(2);
  });

  it("hides workload bar for guest variant", () => {
    render(wrap(<LeaderboardSection
      variant="guest" rows={[entry({ isOwnClub: false })]} defaultOpen onSelect={() => {}}
    />));
    expect(screen.queryByTestId("workload-bar-fill")).toBeNull();
  });

  it("guest section is collapsed by default", () => {
    render(wrap(<LeaderboardSection
      variant="guest" rows={[entry({ isOwnClub: false, displayName: "Unseen, X" })]}
      onSelect={() => {}}
    />));
    expect(screen.queryByText("Unseen, X")).toBeNull();
  });

  it("clicking a name fires onSelect with refereeApiId", () => {
    const onSelect = vi.fn();
    render(wrap(<LeaderboardSection variant="own"
      rows={[entry({ refereeApiId: 200 })]}
      onSelect={onSelect}
    />));
    fireEvent.click(screen.getByText("Mueller, A"));
    expect(onSelect).toHaveBeenCalledWith(200, "Mueller, A");
  });
});
