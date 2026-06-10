// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({ messages: [], sendMessage: vi.fn(), status: "ready" }),
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

describe("RescheduleChatSheet", () => {
  afterEach(cleanup);

  it("renders the panel title when open", () => {
    render(wrap(<RescheduleChatSheet matchId={1} open onOpenChange={() => {}} />));
    expect(screen.getByText("Reschedule assistant")).toBeInTheDocument();
  });

  it("renders the send button when open", () => {
    render(wrap(<RescheduleChatSheet matchId={1} open onOpenChange={() => {}} />));
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });
});
