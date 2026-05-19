// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { CandidatePicker } from "./candidate-picker";

function makeCandidate(over: Record<string, unknown> = {}) {
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

let swrReturnValue: { data?: unknown; error?: unknown } | null = null;

vi.mock("swr", () => ({
  default: vi.fn(() => {
    if (swrReturnValue) return swrReturnValue;
    return {
      data: {
        total: 3,
        results: [
          makeCandidate({ srId: 1, vorname: "Tom", nachName: "Wagner", meta: { ...makeCandidate().meta, total: 3 } }),
          makeCandidate({ srId: 2, vorname: "Lisa", nachName: "Klein", qualiSr2: false, meta: { ...makeCandidate().meta, total: 7 } }),
          makeCandidate({ srId: 3, vorname: "Anna", nachName: "Müller", blocktermin: true, meta: { ...makeCandidate().meta, total: 14 } }),
        ],
      },
    };
  }),
}));

vi.mock("@/hooks/use-debounce", () => ({ useDebounce: (v: string) => v }));

const messages = {
  refereeHub: {
    openSlots: {
      picker: {
        searchPlaceholder: "Search referees…",
        assign: "Assign SR{n}",
        empty: "No eligible referees",
        loadMore: "Load more",
        workload: "{n} games",
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

afterEach(() => cleanup());

describe("CandidatePicker", () => {
  it("renders candidates with workload badge", () => {
    render(wrap(<CandidatePicker gameApiId={4287} slotNumber={1} onPick={vi.fn()} />));
    expect(screen.getByText("Tom Wagner")).toBeInTheDocument();
    expect(screen.getByText("3 games")).toBeInTheDocument();
  });

  it("greys out blocktermin candidates and disables their assign button", () => {
    render(wrap(<CandidatePicker gameApiId={4287} slotNumber={1} onPick={vi.fn()} />));
    const blockedRow = screen.getByText("Anna Müller").closest("[data-candidate]");
    expect(blockedRow).toHaveAttribute("data-disabled", "true");
    const button = blockedRow!.querySelector("button")!;
    expect(button).toBeDisabled();
  });

  it("greys out unqualified candidate for the requested slot (SR2)", () => {
    render(wrap(<CandidatePicker gameApiId={4287} slotNumber={2} onPick={vi.fn()} />));
    const row = screen.getByText("Lisa Klein").closest("[data-candidate]");
    expect(row).toHaveAttribute("data-disabled", "true");
  });

  it("eligible candidate for the same slot (SR1) is assignable", () => {
    render(wrap(<CandidatePicker gameApiId={4287} slotNumber={1} onPick={vi.fn()} />));
    const row = screen.getByText("Lisa Klein").closest("[data-candidate]");
    expect(row).toHaveAttribute("data-disabled", "false");
  });

  it("invokes onPick with srId on Assign click", () => {
    const onPick = vi.fn();
    render(wrap(<CandidatePicker gameApiId={4287} slotNumber={1} onPick={onPick} />));
    const wagnerRow = screen.getByText("Tom Wagner").closest("[data-candidate]")!;
    const button = wagnerRow.querySelector("button")!;
    fireEvent.click(button);
    expect(onPick).toHaveBeenCalledWith(1);
  });

  it("renders candidates in the order returned by the server (no client re-sort)", async () => {
    // Temporarily override swrReturnValue with custom data
    swrReturnValue = {
      data: {
        total: 2,
        results: [
          makeCandidate({ srId: 2, vorname: "Lower", nachName: "Workload", meta: { ...makeCandidate().meta, total: 3 } }),
          makeCandidate({ srId: 1, vorname: "Higher", nachName: "Workload", meta: { ...makeCandidate().meta, total: 10 } }),
        ],
      },
    };

    render(wrap(<CandidatePicker gameApiId={1} slotNumber={1} onPick={() => {}} />));
    const items = await screen.findAllByTestId("candidate-row");
    expect(items[0]).toHaveTextContent("Lower Workload");
    expect(items[1]).toHaveTextContent("Higher Workload");

    // Clean up
    swrReturnValue = null;
  });
});
