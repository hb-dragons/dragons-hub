// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const sendMessage = vi.fn();
const stop = vi.fn();
const regenerate = vi.fn();
const chatMock = vi.fn(() => ({ messages: [] as unknown[], sendMessage, status: "ready", error: undefined, stop, regenerate }));
vi.mock("@ai-sdk/react", () => ({ useChat: () => chatMock() }));
vi.mock("ai", () => ({ DefaultChatTransport: class { constructor(_o: unknown) {} } }));
const sessionMock = vi.fn();
vi.mock("@/lib/auth-client", () => ({ authClient: { useSession: () => sessionMock() } }));

import { ClubAssistant } from "./club-assistant";

const messages = {
  qa: {
    trigger: "Ask the club assistant", title: "Club assistant", description: "d", placeholder: "p",
    send: "Send", stop: "Stop", regenerate: "Regenerate", copy: "Copy", copied: "Copied", close: "Close",
    empty: "e", greetingTitle: "Hi!", greetingSubtitle: "sub", examplesLabel: "Try asking",
    examples: ["Who plays this weekend?", "Standings?", "Results?"],
    error: "Something went wrong. Please try again.",
    activity: { checking: "Checking {what}…", checked: "Checked {what}", failed: "Couldn't read {what}" },
    tools: { get_standings: "standings", get_dashboard: "the club overview", list_matches: "fixtures", fallback: "club data" },
  },
};
function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>;
}

describe("ClubAssistant", () => {
  afterEach(cleanup);
  beforeEach(() => {
    chatMock.mockReturnValue({ messages: [], sendMessage, status: "ready", error: undefined, stop, regenerate });
    sendMessage.mockReset();
    sessionMock.mockReturnValue({ data: { user: { id: "u1" } } });
  });

  it("renders the trigger for a logged-in member", () => {
    render(wrap(<ClubAssistant />));
    expect(screen.getByRole("button", { name: "Ask the club assistant" })).toBeInTheDocument();
  });

  it("renders nothing for an anonymous visitor", () => {
    sessionMock.mockReturnValue({ data: null });
    const { container } = render(wrap(<ClubAssistant />));
    expect(container).toBeEmptyDOMElement();
  });

  it("opens the panel and shows the empty state with example chips", async () => {
    render(wrap(<ClubAssistant />));
    fireEvent.click(screen.getByRole("button", { name: "Ask the club assistant" }));
    expect(await screen.findByText("Hi!")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Who plays this weekend?" })).toBeInTheDocument();
  });

  it("sends an example question when a chip is tapped", async () => {
    render(wrap(<ClubAssistant />));
    fireEvent.click(screen.getByRole("button", { name: "Ask the club assistant" }));
    fireEvent.click(await screen.findByRole("button", { name: "Standings?" }));
    expect(sendMessage).toHaveBeenCalledWith({ text: "Standings?" });
  });

  it("renders the error message when useChat returns an error", async () => {
    chatMock.mockReturnValue({ messages: [], sendMessage, status: "error", error: new Error("boom"), stop, regenerate });
    render(wrap(<ClubAssistant />));
    fireEvent.click(screen.getByRole("button", { name: "Ask the club assistant" }));
    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
  });
});
