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

const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { useSession: () => ({ data: null }) },
}));
vi.mock("@/components/admin/hall-times/hall-time-import-dialog", () => ({
  HallTimeImportDialog: () => null,
}));
vi.mock("@/components/admin/hall-times/venue-hall-times-sheet", () => ({
  VenueHallTimesSheet: ({ venue }: { venue: { name: string } }) => (
    <div data-testid="hall-times-sheet">{venue.name}</div>
  ),
}));

import { VenueListTable } from "./venue-list-table";

describe("<VenueListTable>", () => {
  beforeEach(() => {
    vi.mocked(useSWR).mockReset();
    nav.search = "";
  });
  afterEach(cleanup);

  it("renders an error state with retry, not 'no venues found', when the fetch fails", () => {
    const mutate = vi.fn();
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: new Error("down"),
      isLoading: false,
      mutate,
    } as never);

    render(<VenueListTable />);
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

    render(<VenueListTable />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("empty")).not.toBeInTheDocument();
  });

  describe("?hallTimes deep link", () => {
    const venues = [
      { id: 7, apiId: 70, name: "Goetheschule", street: null, postalCode: null, city: null, latitude: null, longitude: null },
      { id: 8, apiId: 80, name: "Sporthalle Nord", street: null, postalCode: null, city: null, latitude: null, longitude: null },
    ];
    const loaded = () =>
      vi.mocked(useSWR).mockReturnValue({
        data: venues,
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      } as never);

    it("opens the Hallenzeiten panel of the venue named in the query", () => {
      nav.search = "hallTimes=8";
      loaded();
      render(<VenueListTable />);
      expect(screen.getByTestId("hall-times-sheet")).toHaveTextContent("Sporthalle Nord");
    });

    it("opens no panel without the param or for an unknown venue", () => {
      loaded();
      render(<VenueListTable />);
      expect(screen.queryByTestId("hall-times-sheet")).toBeNull();
      cleanup();
      nav.search = "hallTimes=99";
      render(<VenueListTable />);
      expect(screen.queryByTestId("hall-times-sheet")).toBeNull();
    });
  });
});
