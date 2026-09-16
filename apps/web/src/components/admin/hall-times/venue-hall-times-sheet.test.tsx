// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Sheet } from "@dragons/ui/components/sheet";
import type { HallTimeRow, VenueListItem } from "@dragons/shared";

const rows: HallTimeRow[] = [
  { id: 1, venueId: 7, date: "2026-09-19", kind: "open", startTime: "10:00", endTime: "22:00", note: null, source: "anlage_t", createdAt: "", updatedAt: "" },
  { id: 2, venueId: 7, date: "2026-10-03", kind: "closed", startTime: null, endTime: null, note: "Tag der Dt. Einheit", source: "anlage_t", createdAt: "", updatedAt: "" },
  { id: 3, venueId: 7, date: "2026-10-10", kind: "open", startTime: "09:00", endTime: "12:00", note: "Turnier", source: "manual", createdAt: "", updatedAt: "" },
];

const mocks = vi.hoisted(() => ({
  deleteHallTime: vi.fn(),
  upsertHallTime: vi.fn(),
  mutate: vi.fn(),
  swr: { data: undefined as unknown, error: undefined as unknown, isLoading: false },
}));

vi.mock("swr", () => ({
  default: () => ({ ...mocks.swr, mutate: mocks.mutate }),
}));
vi.mock("@/lib/api", () => ({
  api: { venues: { deleteHallTime: mocks.deleteHallTime, upsertHallTime: mocks.upsertHallTime, hallTimes: vi.fn() } },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { VenueHallTimesSheet } from "./venue-hall-times-sheet";
import de from "@/messages/de.json";

const venue: VenueListItem = {
  id: 7, apiId: 70, name: "Gymnasium Goetheschule", street: null, postalCode: null, city: null, latitude: null, longitude: null,
};

const formats = {
  dateTime: {
    matchDate: { weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit" },
    matchTime: { hour: "2-digit", minute: "2-digit" },
  },
} as const;

function renderSheet(canEdit = true) {
  render(
    <NextIntlClientProvider locale="de" timeZone="Europe/Berlin" messages={de} formats={formats}>
      <Sheet open>
        <VenueHallTimesSheet venue={venue} canEdit={canEdit} />
      </Sheet>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.swr = { data: undefined, error: undefined, isLoading: false };
});

describe("VenueHallTimesSheet", () => {
  it("lists the venue's hall times by month with window, closure note and source", () => {
    mocks.swr.data = rows;
    renderSheet();

    expect(screen.getByText("September 2026")).toBeInTheDocument();
    expect(screen.getByText("Oktober 2026")).toBeInTheDocument();
    const items = screen.getAllByTestId("hall-time-row");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("10:00 – 22:00");
    expect(items[1]).toHaveTextContent(de.hallTimes.kind.closed);
    expect(items[1]).toHaveTextContent("Tag der Dt. Einheit");
    expect(items[2]).toHaveTextContent(de.hallTimes.source.manual);
  });

  it("deletes a day and refreshes the list", async () => {
    mocks.swr.data = rows;
    mocks.deleteHallTime.mockResolvedValue({ success: true });
    renderSheet();

    fireEvent.click(screen.getByRole("button", { name: `${de.hallTimes.edit.delete} 2026-10-10` }));

    await waitFor(() => expect(mocks.deleteHallTime).toHaveBeenCalledWith(7, "2026-10-10"));
    expect(mocks.mutate).toHaveBeenCalled();
  });

  it("hides the editor and the delete buttons without venue:update", () => {
    mocks.swr.data = rows;
    renderSheet(false);

    expect(screen.queryByText(de.hallTimes.edit.add)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Löschen/ })).not.toBeInTheDocument();
  });

  it("shows the empty state, and an error state with retry", () => {
    mocks.swr.data = [];
    renderSheet();
    expect(screen.getByText(de.hallTimes.empty)).toBeInTheDocument();
    cleanup();

    mocks.swr = { data: undefined, error: new Error("down"), isLoading: false };
    renderSheet();
    fireEvent.click(screen.getByRole("button", { name: /erneut|again/i }));
    expect(mocks.mutate).toHaveBeenCalled();
  });
});
