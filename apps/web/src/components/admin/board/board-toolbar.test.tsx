// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/use-board-mutations", () => ({
  useBoardMutations: () => ({ deleteBoard: vi.fn() }),
}));
vi.mock("./board-switcher", () => ({ BoardSwitcher: () => null }));
vi.mock("./task-filters", () => ({ TaskFilters: () => null }));

import { BoardToolbar } from "./board-toolbar";

function wrap(ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>
  );
}

describe("<BoardToolbar> icon-only controls", () => {
  afterEach(cleanup);

  it("gives the board-actions menu trigger — the only path to Delete Board — an accessible name", () => {
    render(wrap(<BoardToolbar boardId={1} onAddColumn={vi.fn()} />));
    expect(
      screen.getByRole("button", { name: enMessages.board.moreActions }),
    ).toBeInTheDocument();
  });
});
