// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

type ChatStatus = "ready" | "submitted" | "streaming" | "error";

const sendMessage = vi.fn();
const stop = vi.fn();
const regenerate = vi.fn();
let chatState: {
  status: ChatStatus;
  error?: Error;
  messages: { id: string; role: string; parts: { type: string; text: string }[] }[];
} = { status: "ready", messages: [] };

vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: chatState.messages,
    sendMessage,
    status: chatState.status,
    error: chatState.error,
    stop,
    regenerate,
  }),
}));

vi.mock("ai", () => ({
  DefaultChatTransport: class DefaultChatTransport {
    constructor(_opts: unknown) {}
  },
}));

// Import after mocks
import { RescheduleChatSheet } from "./reschedule-chat-sheet";

const messages = {
  matches: {
    reschedule: {
      trigger: "Suggest reschedule",
      title: "Reschedule assistant",
      description: "Describe your constraints; I'll suggest valid dates and venues.",
      placeholder: "e.g. next 3 weeks, prefer Saturday evenings, keep our gym",
      send: "Send",
      stop: "Stop",
      retry: "Retry",
      error: "Something went wrong. Please try again.",
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

function open() {
  return render(wrap(<RescheduleChatSheet matchId={1} open onOpenChange={() => {}} />));
}

describe("RescheduleChatSheet", () => {
  beforeEach(() => {
    chatState = { status: "ready", messages: [] };
    sendMessage.mockClear();
    stop.mockClear();
    regenerate.mockClear();
  });
  afterEach(cleanup);

  it("renders the panel title when open", () => {
    open();
    expect(screen.getByText("Reschedule assistant")).toBeInTheDocument();
  });

  it("renders the send button when open", () => {
    open();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("offers Stop instead of Send while the assistant is streaming", () => {
    chatState = { status: "streaming", messages: [] };
    open();
    expect(screen.queryByRole("button", { name: "Send" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(stop).toHaveBeenCalledTimes(1);
  });

  describe("after a failed request", () => {
    beforeEach(() => {
      // AI SDK v6 leaves the chat in `status: "error"` after a 500; nothing
      // resets it, so anything gated on `status === "ready"` stays dead.
      chatState = { status: "error", error: new Error("500"), messages: [] };
    });

    it("surfaces the failure", () => {
      open();
      expect(
        screen.getByText("Something went wrong. Please try again."),
      ).toBeInTheDocument();
    });

    it("offers a retry that regenerates the last turn", () => {
      open();
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(regenerate).toHaveBeenCalledTimes(1);
    });

    it("keeps the composer usable so a new message can still be sent", () => {
      open();
      const send = screen.getByRole("button", { name: "Send" });
      expect(send).toBeEnabled();

      fireEvent.change(screen.getByPlaceholderText(messages.matches.reschedule.placeholder), {
        target: { value: "try again next week" },
      });
      fireEvent.click(send);
      expect(sendMessage).toHaveBeenCalledWith({ text: "try again next week" });
    });
  });
});
