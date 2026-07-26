// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import useSWR from "swr";
import enMessages from "@/messages/en.json";

vi.mock("swr", async (importActual) => {
  const actual = await importActual<typeof import("swr")>();
  return { ...actual, default: vi.fn(actual.default), useSWRConfig: () => ({ mutate: vi.fn() }) };
});
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { id: "u1", role: "admin" } } }) },
}));
vi.mock("./booking-detail-sheet", () => ({
  BookingDetailSheet: ({ bookingId, open }: { bookingId: number | null; open: boolean }) =>
    open ? <div data-testid="detail-sheet">open for {bookingId}</div> : null,
}));
vi.mock("./create-booking-dialog", () => ({ CreateBookingDialog: () => null }));
vi.mock("./reconcile-dialog", () => ({ ReconcileDialog: () => null }));

import { BookingListTable } from "./booking-list-table";
import type { BookingListItem } from "./types";

const booking: BookingListItem = {
  id: 1,
  venueId: 1,
  venueName: "Sporthalle Nord",
  date: "2026-05-01",
  status: "confirmed",
  matchCount: 2,
  effectiveStartTime: "18:00:00",
  effectiveEndTime: "20:00:00",
  needsReconfirmation: false,
} as unknown as BookingListItem;

function wrap(ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>
  );
}

describe("<BookingListTable> row interaction", () => {
  afterEach(cleanup);

  it("exposes each booking row as a keyboard-focusable, named control", () => {
    vi.mocked(useSWR).mockReturnValue({ data: [booking], mutate: vi.fn() } as never);
    render(wrap(<BookingListTable />));

    const row = screen.getByRole("button", { name: /sporthalle nord/i });
    expect(row).toHaveAttribute("tabindex", "0");
  });

  it("activates a row's selection via the Enter key", () => {
    vi.mocked(useSWR).mockReturnValue({ data: [booking], mutate: vi.fn() } as never);
    render(wrap(<BookingListTable />));

    const row = screen.getByRole("button", { name: /sporthalle nord/i });
    fireEvent.keyDown(row, { key: "Enter" });
    expect(screen.getByTestId("detail-sheet")).toHaveTextContent("open for 1");
  });

  it("still fires selection on a mouse click", () => {
    vi.mocked(useSWR).mockReturnValue({ data: [booking], mutate: vi.fn() } as never);
    render(wrap(<BookingListTable />));
    const row = screen.getByRole("button", { name: /sporthalle nord/i });
    fireEvent.click(row);
    expect(screen.getByTestId("detail-sheet")).toHaveTextContent("open for 1");
  });
});
