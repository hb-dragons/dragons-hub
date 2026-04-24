// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { MyNotificationsCard } from "./my-notifications-card";

const messages = {
  settings: {
    myNotifications: {
      cardTitle: "Your notifications",
      cardDescription: "Choose which events…",
      events: {
        taskAssigned: "Assigned",
        taskUnassigned: "Unassigned",
        taskComment: "Comment",
        taskDueReminder: "Due",
      },
      language: "Language",
      localeDe: "Deutsch",
      localeEn: "English",
      refereeNote: "Referee note",
      saveSuccess: "Saved",
      saveError: "Error",
    },
  },
};

const mocks = vi.hoisted(() => ({
  fetchAPI: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  fetchAPI: mocks.fetchAPI,
  APIError: class APIError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  },
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

function wrap(ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("MyNotificationsCard", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("renders one checkbox per toggleable event", async () => {
    mocks.fetchAPI.mockResolvedValue({ mutedEventTypes: [], locale: "en" });
    render(wrap(<MyNotificationsCard />));
    await waitFor(() => expect(screen.getByText("Assigned")).toBeInTheDocument());
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
    expect(screen.getByText("Comment")).toBeInTheDocument();
    expect(screen.getByText("Due")).toBeInTheDocument();
  });

  it("shows checkboxes as checked for events NOT in mutedEventTypes", async () => {
    mocks.fetchAPI.mockResolvedValue({
      mutedEventTypes: ["task.assigned"],
      locale: "en",
    });
    render(wrap(<MyNotificationsCard />));
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "Assigned" })).not.toBeChecked(),
    );
    expect(screen.getByRole("checkbox", { name: "Unassigned" })).toBeChecked();
  });

  it("sends PATCH when toggling a checkbox", async () => {
    mocks.fetchAPI.mockResolvedValueOnce({ mutedEventTypes: [], locale: "en" });
    mocks.fetchAPI.mockResolvedValueOnce({
      mutedEventTypes: ["task.assigned"],
      locale: "en",
    });
    render(wrap(<MyNotificationsCard />));
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "Assigned" })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Assigned" }));

    await waitFor(() => {
      expect(mocks.fetchAPI).toHaveBeenLastCalledWith("/admin/notifications/preferences", {
        method: "PATCH",
        body: JSON.stringify({ mutedEventTypes: ["task.assigned"], locale: "en" }),
      });
    });
    expect(mocks.toastSuccess).toHaveBeenCalled();
  });
});
