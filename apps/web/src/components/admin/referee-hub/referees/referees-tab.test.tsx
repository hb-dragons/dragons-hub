// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import useSWR from "swr";
import en from "@/messages/en.json";
import { RefereesTab } from "./referees-tab";

const update = vi.fn();
const hubState = { scope: "own", search: "", sort: "name", refereeId: null as number | null, subtab: "profile" };
vi.mock("../use-referee-hub-url", () => ({
  useRefereeHubUrl: () => ({ state: hubState, update }),
}));

vi.mock("swr", async (importActual) => {
  const actual = await importActual<typeof import("swr")>();
  return { ...actual, default: vi.fn() };
});

const ref = (id: number, matchCount: number) => ({
  id, apiId: 100 + id, firstName: "A", lastName: `Ref${id}`, licenseNumber: id, matchCount,
  allowAllHomeGames: false, allowAwayGames: false, isOwnClub: true, createdAt: "", updatedAt: "",
});

function swr(listHasMore: boolean) {
  vi.mocked(useSWR).mockImplementation((key: unknown) => {
    if (key === "/admin/referees/counts") return { data: { own: 2, all: 9 } } as never;
    return {
      data: { items: [ref(1, 4), ref(2, 7)], total: 2, limit: 50, offset: 0, hasMore: listHasMore },
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    } as never;
  });
}

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <RefereesTab />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  update.mockReset();
  hubState.refereeId = null;
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RefereesTab", () => {
  it("shows the toolbar with counts, the table, and no sheet until a referee is picked", () => {
    swr(false);
    renderTab();
    expect(screen.getByRole("radio", { name: "Own (2)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ref1, A/ })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("averages the games once every referee is loaded, and not before", () => {
    swr(false);
    const { unmount } = renderTab();
    expect(screen.getByText("2 referees · avg 6 games")).toBeInTheDocument();
    unmount();

    swr(true);
    renderTab();
    expect(screen.getByText("2 referees")).toBeInTheDocument();
  });

  it("opens a referee through the URL and passes toolbar changes on", () => {
    swr(false);
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /Ref2, A/ }));
    expect(update).toHaveBeenCalledWith({ refereeId: 2 });
    fireEvent.click(screen.getByRole("radio", { name: "All (9)" }));
    expect(update).toHaveBeenCalledWith({ scope: "all" });
  });
});
