// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { AssistantEmptyState } from "./assistant-empty-state";

const messages = {
  qa: {
    greetingTitle: "Hi! Ask me about the club.",
    greetingSubtitle: "Fixtures, standings, and recent results.",
    examplesLabel: "Try asking",
    examples: ["Who plays this weekend?", "What place is Herren 1 in?", "How did the last games go?"],
  },
};
function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>;
}
afterEach(cleanup);

describe("AssistantEmptyState", () => {
  it("renders the greeting and three example chips", () => {
    render(wrap(<AssistantEmptyState onPick={vi.fn()} />));
    expect(screen.getByText("Hi! Ask me about the club.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Who plays this weekend?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "How did the last games go?" })).toBeInTheDocument();
  });

  it("calls onPick with the chosen question", () => {
    const onPick = vi.fn();
    render(wrap(<AssistantEmptyState onPick={onPick} />));
    fireEvent.click(screen.getByRole("button", { name: "What place is Herren 1 in?" }));
    expect(onPick).toHaveBeenCalledWith("What place is Herren 1 in?");
  });
});
