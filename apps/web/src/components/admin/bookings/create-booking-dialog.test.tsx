// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  mutate: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

const venues = [
  { id: 11, name: "Sporthalle Nord", city: "Berlin" },
  { id: 22, name: "Sporthalle Sued", city: "Berlin" },
];

vi.mock("swr", () => ({
  default: (key: string | null) => ({ data: key ? venues : undefined }),
  useSWRConfig: () => ({ mutate: mocks.mutate }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    bookings: { create: mocks.create },
    venues: { list: vi.fn() },
  },
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

import { CreateBookingDialog } from "./create-booking-dialog";

const messages = {
  common: { failed: "Failed" },
  bookings: {
    create: {
      title: "New Booking",
      venue: "Venue",
      venuePlaceholder: "Select venue...",
      date: "Date",
      startTime: "Start Time",
      endTime: "End Time",
      notes: "Notes",
      notesPlaceholder: "Optional notes...",
      submit: "Create Booking",
    },
    override: { reason: "Reason" },
    toast: { created: "Created" },
  },
};

function wrap(ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

function renderDialog() {
  return render(
    wrap(
      <CreateBookingDialog
        open
        onOpenChange={() => {}}
        onCreated={() => {}}
      />,
    ),
  );
}

function venueInput() {
  return screen.getByPlaceholderText("Select venue...");
}

function submitButton() {
  // `hidden: true` — the combobox popover is modal, so while it is open Radix
  // marks the rest of the dialog aria-hidden.
  return screen.getByRole("button", { name: "Create Booking", hidden: true });
}

/** Type into the combobox and let its debounced search resolve. */
async function typeVenue(text: string) {
  fireEvent.change(venueInput(), { target: { value: text } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
}

function fillWhen() {
  fireEvent.change(screen.getByLabelText("Date"), {
    target: { value: "2026-08-01" },
  });
  fireEvent.change(screen.getByLabelText("Start Time"), {
    target: { value: "18:00" },
  });
  fireEvent.change(screen.getByLabelText("End Time"), {
    target: { value: "20:00" },
  });
}

describe("CreateBookingDialog venue selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mocks.create.mockResolvedValue({ id: 1 });
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("submits the id of the venue named in the input", async () => {
    renderDialog();
    fillWhen();
    await typeVenue("Sporthalle Nord");
    fireEvent.click(screen.getByText("Sporthalle Nord"));

    await act(async () => {
      fireEvent.click(submitButton());
    });

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ venueId: 11 }),
    );
  });

  it("cannot submit a stale venue id after the text is typed over", async () => {
    renderDialog();
    fillWhen();
    await typeVenue("Sporthalle Nord");
    fireEvent.click(screen.getByText("Sporthalle Nord"));
    expect(submitButton()).toBeEnabled();

    // User types over the selected venue without picking from the list.
    await typeVenue("Turnhalle am Park");

    expect(submitButton()).toBeDisabled();

    await act(async () => {
      fireEvent.click(submitButton());
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("re-selecting a different venue replaces the id", async () => {
    renderDialog();
    fillWhen();
    await typeVenue("Sporthalle Nord");
    fireEvent.click(screen.getByText("Sporthalle Nord"));
    await typeVenue("Sporthalle Sued");
    fireEvent.click(screen.getByText("Sporthalle Sued"));

    await act(async () => {
      fireEvent.click(submitButton());
    });

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ venueId: 22 }),
    );
  });
});
