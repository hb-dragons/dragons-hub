// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { AssistantMessage } from "./assistant-message";

const messages = {
  qa: {
    copy: "Copy",
    copied: "Copied",
    regenerate: "Regenerate",
    activity: { checking: "Checking {what}…", checked: "Checked {what}", failed: "Couldn't read {what}" },
    tools: { get_standings: "standings", get_dashboard: "the club overview", list_matches: "fixtures", fallback: "club data" },
  },
};
function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>;
}

afterEach(cleanup);

describe("AssistantMessage", () => {
  it("renders a user message as plain text", () => {
    render(wrap(<AssistantMessage message={{ id: "u1", role: "user", parts: [{ type: "text", text: "hello" }] }} onRegenerate={vi.fn()} />));
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("renders assistant markdown (bold becomes a strong node)", () => {
    render(wrap(<AssistantMessage message={{ id: "a1", role: "assistant", parts: [{ type: "text", text: "Herren 1 are **3rd**." }] }} onRegenerate={vi.fn()} />));
    // streamdown@2.5.0 renders <strong> markdown as <span data-streamdown="strong">, not a native <strong> element.
    const strong = screen.getByText("3rd");
    expect(strong).toHaveAttribute("data-streamdown", "strong");
  });

  it("renders an activity chip for a finished tool part", () => {
    render(wrap(<AssistantMessage message={{ id: "a2", role: "assistant", parts: [{ type: "tool-get_standings", state: "output-available" }, { type: "text", text: "ok" }] }} onRegenerate={vi.fn()} />));
    expect(screen.getByText("Checked standings")).toBeInTheDocument();
  });

  it("shows copy + regenerate on a finished assistant turn and calls regenerate", () => {
    const onRegenerate = vi.fn();
    render(wrap(<AssistantMessage message={{ id: "a3", role: "assistant", parts: [{ type: "text", text: "done" }] }} onRegenerate={onRegenerate} />));
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(onRegenerate).toHaveBeenCalledOnce();
  });
});
