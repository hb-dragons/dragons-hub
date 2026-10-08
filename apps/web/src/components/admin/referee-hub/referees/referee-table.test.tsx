// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RefereeListItem } from "@dragons/shared";
import en from "@/messages/en.json";
import { RefereeTable } from "./referee-table";

const swrMutate = vi.fn();
vi.mock("swr", () => ({ mutate: (...a: unknown[]) => swrMutate(...a) }));

const setVisibility = vi.fn();
vi.mock("@/lib/api", () => ({
  api: { refereeAdmin: { setVisibility: (...a: unknown[]) => setVisibility(...a) } },
  APIError: class APIError extends Error {},
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));

const REFS: RefereeListItem[] = [
  { id: 1, apiId: 100, firstName: "Anna", lastName: "Müller", licenseNumber: 12345, matchCount: 14, allowAllHomeGames: true, allowAwayGames: true, isOwnClub: true, createdAt: "", updatedAt: "" },
  { id: 2, apiId: 101, firstName: "Karl", lastName: "Schmidt", licenseNumber: 33122, matchCount: 7, allowAllHomeGames: false, allowAwayGames: false, isOwnClub: true, createdAt: "", updatedAt: "" },
  { id: 3, apiId: 102, firstName: "Ida", lastName: "Werner", licenseNumber: null, matchCount: 0, allowAllHomeGames: false, allowAwayGames: false, isOwnClub: false, createdAt: "", updatedAt: "" },
];

const noop = () => {};

function renderTable(props: Partial<Parameters<typeof RefereeTable>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <RefereeTable
        referees={REFS}
        error={undefined}
        isLoading={false}
        hasMore={false}
        isLoadingMore={false}
        onLoadMore={noop}
        onRetry={noop}
        selectedId={null}
        onSelect={noop}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

const row = (name: RegExp) => screen.getByRole("button", { name }).closest("div")!;

let observed: IntersectionObserverCallback | null = null;
beforeEach(() => {
  setVisibility.mockReset().mockResolvedValue({});
  swrMutate.mockReset().mockResolvedValue(undefined);
  toastError.mockReset();
  observed = null;
  vi.stubGlobal("IntersectionObserver", class {
    constructor(cb: IntersectionObserverCallback) { observed = cb; }
    observe() {}
    disconnect() {}
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RefereeTable", () => {
  it("gives every referee a named button with the licence from the catalog", () => {
    renderTable();
    expect(screen.getByRole("button", { name: /Müller, Anna/ })).toHaveTextContent("Lic 12345");
    expect(screen.getByRole("button", { name: /Werner, Ida/ })).toHaveTextContent("Lic —");
  });

  it("selects a referee and marks the selected one", () => {
    const onSelect = vi.fn();
    renderTable({ selectedId: 2, onSelect });
    expect(screen.getByRole("button", { name: /Schmidt, Karl/ })).toHaveAttribute("aria-current", "true");
    fireEvent.click(screen.getByRole("button", { name: /Müller, Anna/ }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("shows the visibility settings of own-club referees only", () => {
    renderTable();
    expect(row(/Müller, Anna/)).toHaveTextContent("allyes");
    expect(row(/Schmidt, Karl/)).toHaveTextContent("by rulesno");
    expect(row(/Werner, Ida/)).toHaveTextContent("——");
  });

  it("scales each games bar to the busiest referee loaded", () => {
    const { container } = renderTable();
    const widths = [...container.querySelectorAll<HTMLElement>("[aria-hidden=true] > span")].map((b) => b.style.width);
    expect(widths).toEqual(["100%", "50%", "0%"]);
  });

  it("saves the own-club toggle without opening the referee, then refreshes list and counts", async () => {
    const onSelect = vi.fn();
    renderTable({ onSelect });
    fireEvent.click(within(row(/Werner, Ida/)).getByRole("checkbox", { name: "Own club" }));

    await waitFor(() => expect(setVisibility).toHaveBeenCalledWith(3, { isOwnClub: true, allowAllHomeGames: false, allowAwayGames: false }));
    await waitFor(() => expect(swrMutate).toHaveBeenCalledTimes(2));
    expect(onSelect).not.toHaveBeenCalled();

    // The list revalidation must reach the paged list keys too.
    const filter = swrMutate.mock.calls[0]![0] as (k: unknown) => boolean;
    expect(filter("/admin/referees?scope=own&sort=name&limit=50&offset=0&pages=2")).toBe(true);
    expect(filter("/admin/referees/counts")).toBe(false);
    expect(swrMutate.mock.calls[1]![0]).toBe("/admin/referees/counts");
  });

  it("reports a failed toggle with the API's message or a translated fallback", async () => {
    const { APIError } = await import("@/lib/api");
    setVisibility.mockRejectedValueOnce(new APIError("Federation down"));
    renderTable();
    fireEvent.click(within(row(/Müller, Anna/)).getByRole("checkbox"));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Federation down"));

    setVisibility.mockRejectedValueOnce("boom");
    fireEvent.click(within(row(/Schmidt, Karl/)).getByRole("checkbox"));
    await waitFor(() => expect(toastError).toHaveBeenLastCalledWith(en.refereeHub.referees.ownClubToggleFailed));
  });

  it("asks for the next page as the end of the table comes into view", () => {
    const onLoadMore = vi.fn();
    renderTable({ hasMore: true, onLoadMore });
    observed!([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(onLoadMore).not.toHaveBeenCalled();
    observed!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it("says when more referees are loading, and has no sentinel once all are in", () => {
    renderTable({ hasMore: true, isLoadingMore: true });
    expect(screen.getByText(en.refereeHub.referees.loadingMore)).toBeInTheDocument();
    cleanup();
    renderTable();
    expect(screen.queryByTestId("load-more-sentinel")).not.toBeInTheDocument();
  });

  it("shows loading, empty and failed states, a failure not as 'no referees'", () => {
    const onRetry = vi.fn();
    renderTable({ isLoading: true, referees: [] });
    expect(screen.getByRole("status")).toBeInTheDocument();
    cleanup();

    renderTable({ referees: [] });
    expect(screen.getByText(en.refereeHub.referees.empty)).toBeInTheDocument();
    cleanup();

    renderTable({ error: new Error("down"), onRetry });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(en.refereeHub.referees.empty)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalled();
  });
});
