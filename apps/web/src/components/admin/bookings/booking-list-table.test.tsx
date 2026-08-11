// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BookingListItem } from "@dragons/shared";

const bookings: BookingListItem[] = [
  {
    id: 1,
    venueId: 9,
    venueName: "Sporthalle Nord",
    date: "2026-07-26",
    calculatedStartTime: "18:00:00",
    calculatedEndTime: "21:00:00",
    overrideStartTime: null,
    overrideEndTime: null,
    effectiveStartTime: "18:00:00",
    effectiveEndTime: "21:00:00",
    status: "confirmed",
    needsReconfirmation: false,
    notes: null,
    matchCount: 2,
  },
  {
    // A window that straddles midnight Berlin — the case a UTC container gets
    // wrong in both directions.
    id: 2,
    venueId: 9,
    venueName: "Sporthalle Süd",
    date: "2026-01-10",
    calculatedStartTime: "23:30:00",
    calculatedEndTime: "00:30:00",
    overrideStartTime: null,
    overrideEndTime: null,
    effectiveStartTime: "23:30:00",
    effectiveEndTime: "00:30:00",
    status: "requested",
    needsReconfirmation: false,
    notes: null,
    matchCount: 1,
  },
];

vi.mock("swr", () => ({
  default: () => ({ data: bookings, mutate: vi.fn() }),
  useSWRConfig: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({ api: {} }));
vi.mock("@/lib/swr-queries", () => ({
  queries: { bookings: () => ({ key: "bookings", fetcher: vi.fn() }) },
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: null }) },
}));
vi.mock("./booking-detail-sheet", () => ({ BookingDetailSheet: () => null }));
vi.mock("./create-booking-dialog", () => ({ CreateBookingDialog: () => null }));
vi.mock("./reconcile-dialog", () => ({ ReconcileDialog: () => null }));

import { BookingListTable } from "./booking-list-table";

/**
 * The web container pins Europe/Berlin but the API/SSR container runs UTC, so
 * a time parsed in "whatever zone is running" renders differently on the
 * server than after hydration. These render under non-Berlin zones on purpose;
 * under Europe/Berlin the old code looked correct. `vi.stubEnv` rather than
 * assigning `process.env.TZ` — restoring an unset TZ by assignment writes the
 * literal string "undefined" and drops the worker into UTC.
 */
const ZONES = ["UTC", "America/New_York", "Pacific/Kiritimati"];

const messages = {
  board: { filters: { all: "Alle" } },
  bookings: {
    empty: "Keine",
    needsReconfirmation: "Nachbestätigen",
    columns: {
      date: "Datum",
      venue: "Halle",
      timeWindow: "Zeitfenster",
      matches: "Spiele",
      status: "Status",
    },
    status: {
      pending: "Ausstehend",
      requested: "Angefragt",
      confirmed: "Bestätigt",
      cancelled: "Storniert",
    },
    create: { title: "Anlegen" },
  },
};

const formats = {
  dateTime: {
    matchDate: { weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit" },
    matchTime: { hour: "2-digit", minute: "2-digit" },
  },
} as const;

function renderTable() {
  return render(
    <NextIntlClientProvider
      locale="de"
      timeZone="Europe/Berlin"
      messages={messages}
      formats={formats}
    >
      <BookingListTable />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("BookingListTable time windows", () => {
  it.each(ZONES)("renders the booked Berlin wall clock (TZ=%s)", (tz) => {
    vi.stubEnv("TZ", tz);
    renderTable();
    expect(screen.getByText("18:00 – 21:00")).toBeInTheDocument();
  });

  it.each(ZONES)("renders a window that crosses midnight Berlin (TZ=%s)", (tz) => {
    vi.stubEnv("TZ", tz);
    renderTable();
    expect(screen.getByText("23:30 – 00:30")).toBeInTheDocument();
  });

  it.each(ZONES)("renders the booking's own calendar day (TZ=%s)", (tz) => {
    vi.stubEnv("TZ", tz);
    renderTable();
    expect(screen.getByText(/26\.07\.26/)).toBeInTheDocument();
    expect(screen.getByText(/10\.01\.26/)).toBeInTheDocument();
  });

  it("renders identically in a UTC container and a Berlin browser", () => {
    // React's generated ids differ per render pass; nothing else may.
    const stable = (html: string) => html.replace(/radix-[^"]*/g, "radix-id");
    vi.stubEnv("TZ", "UTC");
    const server = stable(renderTable().container.innerHTML);
    cleanup();
    vi.stubEnv("TZ", "Europe/Berlin");
    const client = stable(renderTable().container.innerHTML);
    expect(client).toBe(server);
  });
});
