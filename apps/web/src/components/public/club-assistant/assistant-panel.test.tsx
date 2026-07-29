// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

const setMessages = vi.fn();
const clearError = vi.fn();
const chatMock = vi.fn(() => ({
  messages: [] as unknown[],
  sendMessage: vi.fn(),
  status: "ready",
  error: undefined as Error | undefined,
  stop: vi.fn(),
  regenerate: vi.fn(),
  setMessages,
  clearError,
}));
vi.mock("@ai-sdk/react", () => ({ useChat: () => chatMock() }));
vi.mock("ai", () => ({ DefaultChatTransport: class { constructor(_o: unknown) {} } }));

import { AssistantPanel } from "./assistant-panel";

const messages = {
  qa: {
    title: "Club assistant",
    close: "Close",
    error: "Something went wrong. Please try again.",
    empty: "e",
    greetingTitle: "Hi!",
    greetingSubtitle: "sub",
    examplesLabel: "Try asking",
    examples: ["Who plays this weekend?"],
    placeholder: "p",
    send: "Send",
    stop: "Stop",
    newChat: "Start a new chat",
  },
};

function wrap(ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("<AssistantPanel> dialog semantics", () => {
  afterEach(cleanup);

  it("exposes itself as a modal dialog labelled by its own title", () => {
    render(wrap(<AssistantPanel onClose={vi.fn()} />));
    const dialog = screen.getByRole("dialog", { name: "Club assistant" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("moves focus into the dialog on open", () => {
    render(wrap(<AssistantPanel onClose={vi.fn()} />));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(wrap(<AssistantPanel onClose={onClose} />));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("traps Tab focus inside the dialog, wrapping past the last focusable element", () => {
    render(wrap(<AssistantPanel onClose={vi.fn()} />));
    const dialog = screen.getByRole("dialog");
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusable.length).toBeGreaterThan(1);
    const last = focusable[focusable.length - 1]!;
    const first = focusable[0]!;

    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(first);
  });

  it("traps Shift+Tab focus inside the dialog, wrapping before the first focusable element", () => {
    render(wrap(<AssistantPanel onClose={vi.fn()} />));
    const dialog = screen.getByRole("dialog");
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const last = focusable[focusable.length - 1]!;
    const first = focusable[0]!;

    first.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("restores focus to the element that was focused before the dialog opened", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "open";
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = render(wrap(<AssistantPanel onClose={vi.fn()} />));
    expect(document.activeElement).not.toBe(trigger);

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});

// Issue #148: a rejected message stays in `messages`, and DefaultChatTransport
// re-sends the whole list every turn, so a single 400 dead-ended the chat until
// the page was reloaded. `setMessages([])` alone is not enough — AI SDK v6 parks
// `status` at "error" and keeps `error` set, so the banner would survive the
// reset; `clearError()` is what returns the chat to "ready".
describe("<AssistantPanel> recovery from a rejected message", () => {
  afterEach(() => {
    cleanup();
    setMessages.mockClear();
    clearError.mockClear();
    chatMock.mockReturnValue({
      messages: [],
      sendMessage: vi.fn(),
      status: "ready",
      error: undefined,
      stop: vi.fn(),
      regenerate: vi.fn(),
      setMessages,
      clearError,
    });
  });

  function renderInError() {
    chatMock.mockReturnValue({
      messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] }],
      sendMessage: vi.fn(),
      status: "error",
      error: new Error("400"),
      stop: vi.fn(),
      regenerate: vi.fn(),
      setMessages,
      clearError,
    });
    render(wrap(<AssistantPanel onClose={vi.fn()} />));
  }

  it("offers a new-chat control while the chat is in an error state", () => {
    renderInError();
    expect(screen.getByRole("button", { name: "Start a new chat" })).toBeInTheDocument();
  });

  it("clears the transcript and the error state when it is used", () => {
    renderInError();
    fireEvent.click(screen.getByRole("button", { name: "Start a new chat" }));
    expect(setMessages).toHaveBeenCalledWith([]);
    expect(clearError).toHaveBeenCalledTimes(1);
  });

  it("does not offer the control when there is no error to recover from", () => {
    render(wrap(<AssistantPanel onClose={vi.fn()} />));
    expect(screen.queryByRole("button", { name: "Start a new chat" })).not.toBeInTheDocument();
  });
});
