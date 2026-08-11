// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import useSWR from "swr";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useFormatter: () => ({ dateTime: (d: Date) => d.toISOString().slice(0, 10) }),
}));

const globalMutate = vi.fn();
vi.mock("swr", async (importActual) => {
  const actual = await importActual<typeof import("swr")>();
  return {
    ...actual,
    default: vi.fn(actual.default),
    useSWRConfig: () => ({ mutate: globalMutate }),
  };
});

// Stand in for the assignment UI: one button that reports "the slot changed".
vi.mock("./slot-card", () => ({
  SlotCard: ({ slotNumber, onChange }: { slotNumber: number; onChange: () => void }) => (
    <button type="button" onClick={onChange}>{`change-sr${slotNumber}`}</button>
  ),
}));

import { OpenSlotDetail } from "./open-slot-detail";

const GAME = {
  id: 1,
  apiMatchId: 500,
  kickoffDate: "2026-05-24",
  kickoffTime: "18:00",
  leagueShort: "OL",
  matchNo: "42",
  homeTeamName: "Dragons",
  guestTeamName: "Bears",
  sr1Status: "open",
  sr2Status: "open",
  sr1Name: null,
  sr2Name: null,
  sr1RefereeApiId: null,
  sr2RefereeApiId: null,
};

describe("<OpenSlotDetail>", () => {
  beforeEach(() => {
    vi.mocked(useSWR).mockReset();
    globalMutate.mockReset();
  });
  afterEach(cleanup);

  it("shows a loading affordance instead of flashing 'game not found' on every click", () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
    } as never);

    render(<OpenSlotDetail selectedGameId={500} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("detail.notFound")).not.toBeInTheDocument();
  });

  it("renders an error state with retry when the game fails to load", () => {
    const mutate = vi.fn();
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: new Error("down"),
      isLoading: false,
      mutate,
    } as never);

    render(<OpenSlotDetail selectedGameId={500} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("detail.notFound")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /tryAgain/i }));
    expect(mutate).toHaveBeenCalled();
  });

  it("still reports 'not found' when the API confirms the game is gone", () => {
    vi.mocked(useSWR).mockReturnValue({
      data: null,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    } as never);

    render(<OpenSlotDetail selectedGameId={500} />);
    expect(screen.getByText("detail.notFound")).toBeInTheDocument();
  });

  it("refreshes the open-games list, not just the detail, after an assignment", () => {
    const mutate = vi.fn();
    vi.mocked(useSWR).mockReturnValue({
      data: GAME,
      error: undefined,
      isLoading: false,
      mutate,
    } as never);

    render(<OpenSlotDetail selectedGameId={500} />);
    fireEvent.click(screen.getByText("change-sr1"));

    expect(mutate).toHaveBeenCalled();
    expect(globalMutate).toHaveBeenCalled();

    // The global revalidation must cover the list keys the left pane uses,
    // otherwise it keeps showing "SR1 open" after the assignment.
    const matcher = globalMutate.mock.calls[0]![0] as (key: unknown) => boolean;
    expect(matcher("/referee/games?status=active&limit=200&offset=0&slotStatus=open")).toBe(true);
    expect(matcher("/admin/referees?scope=own")).toBe(false);
  });
});
