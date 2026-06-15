// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { AssistantComposer } from "./assistant-composer";

const messages = { qa: { placeholder: "Ask…", send: "Send", stop: "Stop" } };
function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>;
}
afterEach(cleanup);

describe("AssistantComposer", () => {
  it("submits trimmed input and clears the field", () => {
    const onSend = vi.fn();
    render(wrap(<AssistantComposer status="ready" onSend={onSend} onStop={vi.fn()} />));
    const box = screen.getByPlaceholderText("Ask…") as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "  hi  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledWith("hi");
    expect(box.value).toBe("");
  });

  it("shows Stop while streaming and calls onStop", () => {
    const onStop = vi.fn();
    render(wrap(<AssistantComposer status="streaming" onSend={vi.fn()} onStop={onStop} />));
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("does not send empty input", () => {
    const onSend = vi.fn();
    render(wrap(<AssistantComposer status="ready" onSend={onSend} onStop={vi.fn()} />));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).not.toHaveBeenCalled();
  });
});
