// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

vi.mock("@ai-sdk/react", () => ({ useChat: () => ({ messages: [], sendMessage: vi.fn(), status: "ready" }) }));
vi.mock("ai", () => ({ DefaultChatTransport: class { constructor(_o: unknown) {} } }));
const sessionMock = vi.fn();
vi.mock("@/lib/auth-client", () => ({ authClient: { useSession: () => sessionMock() } }));

// Import after mocks
import { ClubAssistant } from "./club-assistant";

const messages = {
  qa: { trigger: "Ask the club assistant", title: "Club assistant", description: "d", placeholder: "p", send: "Send", empty: "e", error: "x" },
};
function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>;
}

describe("ClubAssistant", () => {
  afterEach(cleanup);

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
});
