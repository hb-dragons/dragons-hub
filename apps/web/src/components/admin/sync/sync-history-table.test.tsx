// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";

vi.mock("./use-sync", () => ({
  useSyncLogs: () => useSyncLogsMock(),
  useRefereeSyncLogs: () => useSyncLogsMock(),
}));
vi.mock("./sync-log-detail", () => ({ SyncLogDetail: () => <div>detail</div> }));

const useSyncLogsMock = vi.fn();

import { SyncHistoryTable } from "./sync-history-table";

const run = {
  id: 1,
  syncType: "matches",
  status: "completed",
  startedAt: "2026-05-01T10:00:00.000Z",
  finishedAt: "2026-05-01T10:01:00.000Z",
  durationMs: 60000,
  recordsCreated: 1,
  recordsUpdated: 2,
  recordsSkipped: 0,
  recordsFailed: 0,
  triggeredBy: "cron",
  triggeredByName: null,
  errorMessage: null,
};

function wrap(ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>
  );
}

describe("<SyncHistoryTable> row interaction", () => {
  afterEach(cleanup);

  it("exposes each sync-run row as a keyboard-operable disclosure control", () => {
    useSyncLogsMock.mockReturnValue({ logs: [run], hasMore: false });
    render(wrap(<SyncHistoryTable />));

    const row = screen.getByRole("button", { name: /matches/i });
    expect(row).toHaveAttribute("tabindex", "0");
    expect(row).toHaveAttribute("aria-expanded", "false");

    fireEvent.keyDown(row, { key: "Enter" });
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("detail")).toBeInTheDocument();
  });

  it("also activates via the Space key", () => {
    useSyncLogsMock.mockReturnValue({ logs: [run], hasMore: false });
    render(wrap(<SyncHistoryTable />));

    const row = screen.getByRole("button", { name: /matches/i });
    fireEvent.keyDown(row, { key: " " });
    expect(row).toHaveAttribute("aria-expanded", "true");
  });
});
