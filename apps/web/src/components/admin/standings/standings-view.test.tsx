// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import useSWR from "swr";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
}));

vi.mock("swr", async (importActual) => {
  const actual = await importActual<typeof import("swr")>();
  return { ...actual, default: vi.fn(actual.default) };
});

import { StandingsView } from "./standings-view";

describe("<StandingsView>", () => {
  beforeEach(() => vi.mocked(useSWR).mockReset());
  afterEach(cleanup);

  it("renders an error state with retry, not the empty state, when the fetch fails", () => {
    const mutate = vi.fn();
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: new Error("down"),
      isLoading: false,
      mutate,
    } as never);

    render(<StandingsView />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("empty")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /tryAgain/i }));
    expect(mutate).toHaveBeenCalled();
  });

  it("shows a loading affordance instead of the empty state while fetching", () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
    } as never);

    render(<StandingsView />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("empty")).not.toBeInTheDocument();
  });

  it("still shows the empty state when the API genuinely returns nothing", () => {
    vi.mocked(useSWR).mockReturnValue({
      data: [],
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    } as never);

    render(<StandingsView />);
    expect(screen.getByText("empty")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
