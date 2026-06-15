// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const chatMock = vi.fn(() => ({ messages: [], sendMessage: vi.fn(), status: "ready", error: undefined }));
vi.mock("@ai-sdk/react", () => ({ useChat: () => chatMock() }));
vi.mock("ai", () => ({ DefaultChatTransport: class { constructor(_o: unknown) {} } }));
const sessionMock = vi.fn();
vi.mock("@/lib/auth-client", () => ({ authClient: { useSession: () => sessionMock() } }));

// Import after mocks
import { ClubAssistant } from "./club-assistant";

const messages = {
  qa: { trigger: "Ask the club assistant", title: "Club assistant", description: "d", placeholder: "p", send: "Send", empty: "e", error: "Something went wrong. Please try again." },
};
function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>;
}

describe("ClubAssistant", () => {
  afterEach(cleanup);
  beforeEach(() => {
    chatMock.mockReturnValue({ messages: [], sendMessage: vi.fn(), status: "ready", error: undefined });
  });

  it("renders the trigger for a logged-in member", () => {
    sessionMock.mockReturnValue({ data: { user: { id: "u1" } } });
    render(wrap(<ClubAssistant />));
    expect(screen.getByRole("button", { name: "Ask the club assistant" })).toBeInTheDocument();
  });

  it("renders nothing for an anonymous visitor", () => {
    sessionMock.mockReturnValue({ data: null });
    const { container } = render(wrap(<ClubAssistant />));
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the error message when useChat returns an error", () => {
    chatMock.mockReturnValue({ messages: [], sendMessage: vi.fn(), status: "error", error: new Error("boom") });
    sessionMock.mockReturnValue({ data: { user: { id: "u1" } } });
    render(wrap(<ClubAssistant />));
    fireEvent.click(screen.getByRole("button", { name: "Ask the club assistant" }));
    expect(screen.getByText("Something went wrong. Please try again.")).toBeInTheDocument();
  });
});
