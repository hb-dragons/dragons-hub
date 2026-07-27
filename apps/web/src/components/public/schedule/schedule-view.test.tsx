// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import type { MatchListItem } from "@dragons/shared";

vi.mock("next-intl", () => ({
  useFormatter: () => ({ dateTime: (d: Date) => d.toISOString().slice(0, 10) }),
  useTranslations: () => (k: string) => k,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));

const getMatches = vi.fn();
vi.mock("@/lib/api", () => ({
  api: { public: { getMatches: (...args: unknown[]) => getMatches(...args) } },
}));

// The list itself is not under test; render just enough to read the ids that
// actually landed in state.
vi.mock("./match-list", () => ({
  MatchList: ({ matches }: { matches: { id: number }[] }) => (
    <div data-testid="matches">{matches.map((m) => m.id).join(",")}</div>
  ),
}));

import { ScheduleView } from "./schedule-view";

const translations = {
  vs: "vs",
  matchCancelled: "cancelled",
  matchForfeited: "forfeited",
  noMatchesThisWeekend: "no matches this weekend",
};

function match(id: number): MatchListItem {
  return { id, kickoffDate: "2026-03-14" } as MatchListItem;
}

/** A promise plus the handles to settle it later. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Let every pending microtask and one macrotask settle inside act(). */
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

function renderView() {
  return render(
    <ScheduleView
      teams={[]}
      initialMatches={[match(1)]}
      initialSaturday="2026-03-14"
      translations={translations}
    />,
  );
}

describe("<ScheduleView> stale-response handling", () => {
  beforeEach(() => {
    getMatches.mockReset();
  });
  afterEach(cleanup);

  it("ignores an earlier response that resolves after a later one", async () => {
    const first = deferred<{ items: MatchListItem[] }>();
    const second = deferred<{ items: MatchListItem[] }>();
    getMatches.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    renderView();
    // Two rapid pages forward: request A then request B.
    fireEvent.click(screen.getByLabelText("nextWeekend"));
    fireEvent.click(screen.getByLabelText("nextWeekend"));
    expect(getMatches).toHaveBeenCalledTimes(2);

    // B lands first, then the stale A. The view must keep B.
    second.resolve({ items: [match(20)] });
    await waitFor(() => expect(screen.getByTestId("matches")).toHaveTextContent("20"));

    first.resolve({ items: [match(10)] });
    await flush();
    expect(screen.getByTestId("matches")).toHaveTextContent("20");
    expect(screen.getByTestId("matches")).not.toHaveTextContent("10");
  });

  it("aborts the in-flight request when the user pages again", () => {
    getMatches.mockReturnValue(deferred<{ items: MatchListItem[] }>().promise);
    renderView();

    fireEvent.click(screen.getByLabelText("nextWeekend"));
    const firstSignal = (getMatches.mock.calls[0]![1] as { signal: AbortSignal }).signal;
    expect(firstSignal.aborted).toBe(false);

    fireEvent.click(screen.getByLabelText("nextWeekend"));
    expect(firstSignal.aborted).toBe(true);
  });

  it("does not let a stale failure blank out the newest results", async () => {
    const first = deferred<{ items: MatchListItem[] }>();
    const second = deferred<{ items: MatchListItem[] }>();
    getMatches.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    renderView();
    fireEvent.click(screen.getByLabelText("nextWeekend"));
    fireEvent.click(screen.getByLabelText("nextWeekend"));

    second.resolve({ items: [match(20)] });
    await waitFor(() => expect(screen.getByTestId("matches")).toHaveTextContent("20"));

    first.reject(new Error("aborted"));
    await flush();
    expect(screen.getByTestId("matches")).toHaveTextContent("20");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("<ScheduleView> failure handling", () => {
  beforeEach(() => {
    getMatches.mockReset();
  });
  afterEach(cleanup);

  it("renders an error state with retry instead of 'no matches this weekend'", async () => {
    getMatches.mockRejectedValueOnce(new Error("server down"));
    renderView();
    fireEvent.click(screen.getByLabelText("nextWeekend"));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByTestId("matches")).not.toBeInTheDocument();

    // Retry re-issues the request and recovers.
    getMatches.mockResolvedValueOnce({ items: [match(5)] });
    fireEvent.click(screen.getByRole("button", { name: /tryAgain/i }));
    await waitFor(() => expect(screen.getByTestId("matches")).toHaveTextContent("5"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
