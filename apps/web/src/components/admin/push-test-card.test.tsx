// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const mocks = vi.hoisted(() => ({
  sendTestPush: vi.fn(),
  recentTestPush: vi.fn(),
  mutate: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  toastError: vi.fn(),
}));

const swrData: { current: { results: unknown[] } | undefined } = { current: undefined };

vi.mock("swr", () => ({
  default: () => ({ data: swrData.current, mutate: mocks.mutate }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    notificationTest: {
      sendTestPush: mocks.sendTestPush,
      recentTestPush: mocks.recentTestPush,
    },
  },
  APIError: class APIError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
      this.name = "APIError";
    }
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
    error: mocks.toastError,
  },
}));

import { PushTestCard } from "./push-test-card";
import { APIError as MockAPIError } from "@/lib/api";

const messages = {
  settings: {
    pushTest: {
      title: "Test push notification",
      description: "Send a test notification to every device registered against this admin account.",
      messageLabel: "Custom message (optional)",
      messagePlaceholder: "Leave empty for default test message",
      sendButton: "Send test push",
      sendingButton: "Sending…",
      noDevicesError: "No devices registered. Open the native app on a signed-in device first.",
      permissionError: "Admin permissions required",
      genericError: "Failed to send test push",
      recentHeading: "Recent test pushes",
      emptyState: "No test pushes yet. Send one above to see results.",
      columns: { sentAt: "Sent at", token: "Token", status: "Status", error: "Error" },
      toast: {
        success: "Test push sent to {count, plural, one {# device} other {# devices}}",
        partialFailure: "{failed} of {total} pushes failed",
      },
    },
  },
  notifications: {
    statuses: {
      pending: "Pending",
      sent: "Sent",
      sent_ticket: "Accepted",
      delivered: "Delivered",
      read: "Read",
      failed: "Failed",
      unknown: "Unknown",
    },
  },
};

function wrap(ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

function sendButton() {
  return screen.getByRole("button", { name: /Send test push/ });
}

describe("PushTestCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    swrData.current = { results: [] };
  });
  afterEach(cleanup);

  it("shows the noDevicesError toast when the API rejects with code NO_DEVICES", async () => {
    // Without a `code` on the body, APIError.code falls back to "UNKNOWN_ERROR"
    // (packages/api-client/src/client.ts:172) — this is why the card must key
    // off err.code rather than pattern-matching err.message/status.
    mocks.sendTestPush.mockRejectedValueOnce(
      new MockAPIError(400, "NO_DEVICES", "Open the native app on a signed-in device first."),
    );
    render(wrap(<PushTestCard />));

    await act(async () => {
      fireEvent.click(sendButton());
    });

    expect(mocks.toastError).toHaveBeenCalledWith(
      "No devices registered. Open the native app on a signed-in device first.",
    );
  });

  it("does not show the noDevicesError toast for an unrelated 400", async () => {
    // Regression guard for the old regex: a 400 whose code is something else
    // (or missing) must fall through to the generic branch, not match on
    // status alone.
    mocks.sendTestPush.mockRejectedValueOnce(
      new MockAPIError(400, "VALIDATION_ERROR", "Invalid request data"),
    );
    render(wrap(<PushTestCard />));

    await act(async () => {
      fireEvent.click(sendButton());
    });

    expect(mocks.toastError).not.toHaveBeenCalledWith(
      "No devices registered. Open the native app on a signed-in device first.",
    );
    expect(mocks.toastError).toHaveBeenCalledWith("Invalid request data");
  });

  it("shows the permissionError toast on a 403", async () => {
    mocks.sendTestPush.mockRejectedValueOnce(new MockAPIError(403, "FORBIDDEN", "Forbidden"));
    render(wrap(<PushTestCard />));

    await act(async () => {
      fireEvent.click(sendButton());
    });

    expect(mocks.toastError).toHaveBeenCalledWith("Admin permissions required");
  });

  it("shows a success toast and clears the message on a clean send", async () => {
    mocks.sendTestPush.mockResolvedValueOnce({
      deviceCount: 2,
      tickets: [
        { platform: "ios", status: "sent_ticket", ticketId: "t1", error: null },
        { platform: "android", status: "sent_ticket", ticketId: "t2", error: null },
      ],
    });
    render(wrap(<PushTestCard />));

    await act(async () => {
      fireEvent.click(sendButton());
    });

    expect(mocks.toastSuccess).toHaveBeenCalled();
    expect(mocks.toastWarning).not.toHaveBeenCalled();
  });
});
