// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { useCandidateSearch } from "./use-candidate-search";
import type { RefCandidate } from "./candidate-block-reason";

const searchAssignmentCandidates = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    referees: {
      searchAssignmentCandidates: (...a: unknown[]) => searchAssignmentCandidates(...a),
    },
  },
}));

function makeCandidate(srId: number): RefCandidate {
  return {
    srId, vorname: `Ref${srId}`, nachName: "Test", email: "", lizenznr: srId,
    strasse: "", plz: "", ort: "", distanceKm: "0",
    qmaxSr1: null, qmaxSr2: null, warning: [],
    meta: { schiedsrichterId: srId, lizenzNr: srId, heimTotal: 0, gastTotal: 0, total: 0, va: 0, eh: 0, qmaxSr1: null, qmaxSr2: null, tnaCount: 0, sperrvereinCount: 0, sperrzeitenCount: 0, qualiSr1: 1, qualiSr2: 1, qualiSr3: 0, qualiCoa: 0, qualiKom: 0, entfernung: 0, maxDatumBefore: null, minDatumAfter: null, anzAmTag: 0, anzInWoche: 0, anzImMonat: 0 },
    qualiSr1: true, qualiSr2: true, qualiSr3: false, qualiCoa: false, qualiKom: false,
    srModusMismatchSr1: false, srModusMismatchSr2: false,
    ansetzungAmTag: false, blocktermin: false, zeitraumBlockiert: null,
    srGruppen: [],
  };
}

function page(ids: number[], total: number) {
  return { total, results: ids.map(makeCandidate) };
}

function range(from: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => from + i);
}

// Fresh SWR cache per render so tests don't leak state into each other.
function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
      {children}
    </SWRConfig>
  );
}

beforeEach(() => {
  searchAssignmentCandidates.mockReset();
});

describe("useCandidateSearch", () => {
  it("loads the first page with page-index 0", async () => {
    searchAssignmentCandidates.mockResolvedValueOnce(page(range(1, 15), 30));
    const { result } = renderHook(() => useCandidateSearch(4287, 1, ""), { wrapper });

    await waitFor(() => expect(result.current.candidates).toHaveLength(15));
    expect(result.current.total).toBe(30);
    expect(result.current.hasMore).toBe(true);
    expect(searchAssignmentCandidates).toHaveBeenCalledWith(4287, {
      search: "", pageFrom: 0, pageSize: 15, slotNumber: 1,
    });
  });

  it("appends the next page on loadMore (does not replace)", async () => {
    searchAssignmentCandidates
      .mockResolvedValueOnce(page(range(1, 15), 30))
      .mockResolvedValueOnce(page(range(16, 15), 30));
    const { result } = renderHook(() => useCandidateSearch(4287, 1, ""), { wrapper });
    await waitFor(() => expect(result.current.candidates).toHaveLength(15));

    act(() => result.current.loadMore());

    await waitFor(() => expect(result.current.candidates).toHaveLength(30));
    expect(result.current.candidates[0].srId).toBe(1);
    expect(result.current.candidates[15].srId).toBe(16);
    expect(result.current.hasMore).toBe(false);
    expect(searchAssignmentCandidates).toHaveBeenLastCalledWith(4287, {
      search: "", pageFrom: 1, pageSize: 15, slotNumber: 1,
    });
  });

  it("resets to page 0 when the search term changes", async () => {
    searchAssignmentCandidates
      .mockResolvedValueOnce(page(range(1, 15), 30))
      .mockResolvedValueOnce(page(range(16, 15), 30))
      .mockResolvedValueOnce(page([99], 1));
    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useCandidateSearch(4287, 1, q),
      { wrapper, initialProps: { q: "" } },
    );
    await waitFor(() => expect(result.current.candidates).toHaveLength(15));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.candidates).toHaveLength(30));

    rerender({ q: "wag" });

    await waitFor(() => {
      expect(result.current.candidates).toHaveLength(1);
      expect(result.current.candidates[0].srId).toBe(99);
    });
    expect(result.current.hasMore).toBe(false);
    expect(searchAssignmentCandidates).toHaveBeenLastCalledWith(4287, {
      search: "wag", pageFrom: 0, pageSize: 15, slotNumber: 1,
    });
  });

  it("hasMore is false on an empty result", async () => {
    searchAssignmentCandidates.mockResolvedValueOnce(page([], 0));
    const { result } = renderHook(() => useCandidateSearch(4287, 2, "zzz"), { wrapper });
    await waitFor(() => expect(result.current.isLoadingMore).toBe(false));
    expect(result.current.candidates).toHaveLength(0);
    expect(result.current.hasMore).toBe(false);
    expect(searchAssignmentCandidates).toHaveBeenCalledWith(4287, {
      search: "zzz", pageFrom: 0, pageSize: 15, slotNumber: 2,
    });
  });

  it("stops reporting isLoadingMore when the fetch fails", async () => {
    searchAssignmentCandidates.mockRejectedValueOnce(new Error("federation down"));
    const { result } = renderHook(() => useCandidateSearch(4287, 1, ""), { wrapper });
    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.isLoadingMore).toBe(false);
    expect(result.current.candidates).toHaveLength(0);
  });
});
