// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { CandidatePicker } from "./candidate-picker";
import type { RefCandidate } from "./candidate-block-reason";

function makeCandidate(over: Partial<RefCandidate> = {}): RefCandidate {
  return {
    srId: 1, vorname: "Tom", nachName: "Wagner", email: "", lizenznr: 88421,
    strasse: "", plz: "", ort: "", distanceKm: "0",
    qmaxSr1: null, qmaxSr2: null, warning: [],
    meta: { schiedsrichterId: 1, lizenzNr: 88421, heimTotal: 1, gastTotal: 2, total: 3, va: 0, eh: 0, qmaxSr1: null, qmaxSr2: null, tnaCount: 0, sperrvereinCount: 0, sperrzeitenCount: 0, qualiSr1: 1, qualiSr2: 1, qualiSr3: 0, qualiCoa: 0, qualiKom: 0, entfernung: 0, maxDatumBefore: null, minDatumAfter: null, anzAmTag: 0, anzInWoche: 0, anzImMonat: 0 },
    qualiSr1: true, qualiSr2: true, qualiSr3: false, qualiCoa: false, qualiKom: false,
    srModusMismatchSr1: false, srModusMismatchSr2: false,
    ansetzungAmTag: false, blocktermin: false, zeitraumBlockiert: null,
    srGruppen: [],
    ...over,
  };
}

const hookReturn: {
  candidates: RefCandidate[];
  total: number;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: ReturnType<typeof vi.fn>;
  error: unknown;
} = {
  candidates: [],
  total: 0,
  hasMore: false,
  isLoadingMore: false,
  loadMore: vi.fn(),
  error: undefined,
};

vi.mock("./use-candidate-search", () => ({
  useCandidateSearch: () => hookReturn,
}));

vi.mock("@/hooks/use-debounce", () => ({ useDebounce: (v: string) => v }));

// happy-dom has no IntersectionObserver; capture the callback so tests can
// simulate the sentinel entering the viewport.
let observerCallback: ((entries: Array<{ isIntersecting: boolean }>) => void) | null = null;
class FakeIntersectionObserver {
  constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
    observerCallback = cb;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);

const messages = {
  refereeHub: {
    openSlots: {
      picker: {
        searchPlaceholder: "Search referees…",
        assign: "Assign SR{n}",
        empty: "No eligible referees",
        workload: "{n} games",
        assignTrigger: "Assign referee…",
        showIneligible: "Show {n} ineligible",
        hideIneligible: "Hide ineligible",
        loadingMore: "Loading more…",
        loadError: "Failed to load referees.",
        disposition: {
          notQualifiedSr1: "Not qualified as SR1",
          notQualifiedSr2: "Not qualified as SR2",
          modeMismatchSr1: "SR1 mode mismatch",
          modeMismatchSr2: "SR2 mode mismatch",
          blocked: "Blocked",
        },
      },
    },
  },
};

function wrap(ui: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={messages as never}>{ui}</NextIntlClientProvider>;
}

beforeEach(() => {
  hookReturn.candidates = [
    makeCandidate({ srId: 1, vorname: "Tom", nachName: "Wagner", meta: { ...makeCandidate().meta, total: 3 } }),
    makeCandidate({ srId: 2, vorname: "Lisa", nachName: "Klein", qualiSr2: false, meta: { ...makeCandidate().meta, total: 7 } }),
    makeCandidate({ srId: 3, vorname: "Anna", nachName: "Müller", blocktermin: true, meta: { ...makeCandidate().meta, total: 14 } }),
  ];
  hookReturn.total = 3;
  hookReturn.hasMore = false;
  hookReturn.isLoadingMore = false;
  hookReturn.loadMore = vi.fn();
  hookReturn.error = undefined;
  observerCallback = null;
});

afterEach(() => cleanup());

describe("CandidatePicker", () => {
  it("renders eligible candidates with workload badge", () => {
    render(wrap(<CandidatePicker gameApiId={4287} slotNumber={1} onPick={vi.fn()} />));
    expect(screen.getByText("Tom Wagner")).toBeInTheDocument();
    expect(screen.getByText("3 games")).toBeInTheDocument();
    // Lisa lacks SR2 quali but slot is 1 → eligible here
    expect(screen.getByText("Lisa Klein")).toBeInTheDocument();
  });

  it("hides ineligible candidates behind the toggle and reveals them with a reason", () => {
    render(wrap(<CandidatePicker gameApiId={4287} slotNumber={1} onPick={vi.fn()} />));
    // Anna has blocktermin → ineligible for any slot
    expect(screen.queryByText("Anna Müller")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show 1 ineligible" }));

    const row = screen.getByText("Anna Müller").closest("[data-candidate]");
    expect(row).toHaveAttribute("data-disabled", "true");
    expect(screen.getByText("Blocked")).toBeInTheDocument();
    const button = row!.querySelector("button")!;
    expect(button).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Hide ineligible" }));
    expect(screen.queryByText("Anna Müller")).not.toBeInTheDocument();
  });

  it("treats slot-specific qualification correctly (SR2)", () => {
    render(wrap(<CandidatePicker gameApiId={4287} slotNumber={2} onPick={vi.fn()} />));
    // Lisa lacks SR2 quali → hidden until toggled
    expect(screen.queryByText("Lisa Klein")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show 2 ineligible" }));
    expect(screen.getByText("Lisa Klein")).toBeInTheDocument();
    expect(screen.getByText("Not qualified as SR2")).toBeInTheDocument();
  });

  it("invokes onPick with srId on Assign click", () => {
    const onPick = vi.fn();
    render(wrap(<CandidatePicker gameApiId={4287} slotNumber={1} onPick={onPick} />));
    const row = screen.getByText("Tom Wagner").closest("[data-candidate]")!;
    fireEvent.click(row.querySelector("button")!);
    expect(onPick).toHaveBeenCalledWith(1);
  });

  it("keeps server order within the eligible section (no client re-sort)", () => {
    hookReturn.candidates = [
      makeCandidate({ srId: 2, vorname: "Lower", nachName: "Workload", meta: { ...makeCandidate().meta, total: 3 } }),
      makeCandidate({ srId: 1, vorname: "Higher", nachName: "Workload", meta: { ...makeCandidate().meta, total: 10 } }),
    ];
    render(wrap(<CandidatePicker gameApiId={1} slotNumber={1} onPick={() => {}} />));
    const items = screen.getAllByTestId("candidate-row");
    expect(items[0]).toHaveTextContent("Lower Workload");
    expect(items[1]).toHaveTextContent("Higher Workload");
  });

  it("shows the empty state when there are no eligible candidates", () => {
    hookReturn.candidates = [];
    hookReturn.total = 0;
    render(wrap(<CandidatePicker gameApiId={4287} slotNumber={1} onPick={vi.fn()} />));
    expect(screen.getByText("No eligible referees")).toBeInTheDocument();
  });

  it("loads the next page when the scroll sentinel becomes visible", () => {
    hookReturn.hasMore = true;
    render(wrap(<CandidatePicker gameApiId={4287} slotNumber={1} onPick={vi.fn()} />));
    expect(screen.getByTestId("scroll-sentinel")).toBeInTheDocument();

    act(() => observerCallback?.([{ isIntersecting: true }]));

    expect(hookReturn.loadMore).toHaveBeenCalledTimes(1);
  });

  it("renders no sentinel when there are no more pages", () => {
    hookReturn.hasMore = false;
    render(wrap(<CandidatePicker gameApiId={4287} slotNumber={1} onPick={vi.fn()} />));
    expect(screen.queryByTestId("scroll-sentinel")).not.toBeInTheDocument();
  });

  it("shows a loading row while a page is in flight", () => {
    hookReturn.isLoadingMore = true;
    render(wrap(<CandidatePicker gameApiId={4287} slotNumber={1} onPick={vi.fn()} />));
    expect(screen.getByText("Loading more…")).toBeInTheDocument();
  });

  it("does not show the empty state while the first page is loading", () => {
    hookReturn.candidates = [];
    hookReturn.total = 0;
    hookReturn.isLoadingMore = true;
    render(wrap(<CandidatePicker gameApiId={4287} slotNumber={1} onPick={vi.fn()} />));
    expect(screen.queryByText("No eligible referees")).not.toBeInTheDocument();
    expect(screen.getByText("Loading more…")).toBeInTheDocument();
  });

  it("does not observe the sentinel while a page is in flight", () => {
    hookReturn.hasMore = true;
    hookReturn.isLoadingMore = true;
    render(wrap(<CandidatePicker gameApiId={4287} slotNumber={1} onPick={vi.fn()} />));
    expect(screen.getByTestId("scroll-sentinel")).toBeInTheDocument();
    expect(observerCallback).toBeNull();
  });

  it("shows an error row instead of the empty state when the fetch fails", () => {
    hookReturn.candidates = [];
    hookReturn.total = 0;
    hookReturn.error = new Error("boom");
    render(wrap(<CandidatePicker gameApiId={4287} slotNumber={1} onPick={vi.fn()} />));
    expect(screen.getByText("Failed to load referees.")).toBeInTheDocument();
    expect(screen.queryByText("No eligible referees")).not.toBeInTheDocument();
  });

  it("marks the ineligible toggle as a disclosure (aria-expanded)", () => {
    render(wrap(<CandidatePicker gameApiId={4287} slotNumber={1} onPick={vi.fn()} />));
    const toggle = screen.getByRole("button", { name: "Show 1 ineligible" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide ineligible" })).toHaveAttribute("aria-expanded", "true");
  });
});
