import { useCallback, useEffect, useRef, useState } from "react";
import * as SecureStore from "expo-secure-store";
import {
  serializeFilters,
  parseFilters,
  type SerialisableBoardFilters,
} from "@dragons/shared";

/**
 * Per-board filter persistence keyed by `board:<id>:filters`. Backed by
 * expo-secure-store (AsyncStorage is not installed in apps/native).
 *
 * The sort mode is stored under `board:<id>:sort`. We expose two state
 * tuples so screens can reuse the same hot-path memoisation.
 */

import type { BoardSortMode } from "@dragons/shared";
export type { BoardSortMode };

const SORT_MODES: readonly BoardSortMode[] = [
  "position",
  "due-asc",
  "due-desc",
  "priority-desc",
  "updated-desc",
];

const DEFAULT_SORT: BoardSortMode = "position";

function isSortMode(v: unknown): v is BoardSortMode {
  return typeof v === "string" && (SORT_MODES as readonly string[]).includes(v);
}

const filtersKey = (boardId: number) => `board:${boardId}:filters`;
const sortKey = (boardId: number) => `board:${boardId}:sort`;

interface PersistedState {
  filters: SerialisableBoardFilters;
  sort: BoardSortMode;
  /** True until the initial load from storage has resolved. */
  hydrating: boolean;
}

export function useBoardFilterPersistence(boardId: number) {
  const [state, setState] = useState<PersistedState>(() => ({
    filters: parseFilters(null),
    sort: DEFAULT_SORT,
    hydrating: true,
  }));

  // Track whether we've hydrated to avoid persisting the default state on
  // first render before the actual stored value is known.
  const hydratedRef = useRef(false);

  // Hydrate on mount / boardId change.
  useEffect(() => {
    let cancelled = false;
    hydratedRef.current = false;
    setState((s) => ({ ...s, hydrating: true }));
    void (async () => {
      try {
        const [rawFilters, rawSort] = await Promise.all([
          SecureStore.getItemAsync(filtersKey(boardId)),
          SecureStore.getItemAsync(sortKey(boardId)),
        ]);
        if (cancelled) return;
        const parsedFilters = parseFilters(rawFilters);
        const parsedSort = isSortMode(rawSort) ? rawSort : DEFAULT_SORT;
        setState({ filters: parsedFilters, sort: parsedSort, hydrating: false });
      } finally {
        hydratedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  // Persist filters whenever they change post-hydration.
  useEffect(() => {
    if (!hydratedRef.current) return;
    void SecureStore.setItemAsync(
      filtersKey(boardId),
      serializeFilters(state.filters),
    );
  }, [boardId, state.filters]);

  // Persist sort mode post-hydration.
  useEffect(() => {
    if (!hydratedRef.current) return;
    void SecureStore.setItemAsync(sortKey(boardId), state.sort);
  }, [boardId, state.sort]);

  const setFilters = useCallback(
    (
      next:
        | SerialisableBoardFilters
        | ((prev: SerialisableBoardFilters) => SerialisableBoardFilters),
    ) => {
      setState((s) => ({
        ...s,
        filters: typeof next === "function" ? next(s.filters) : next,
      }));
    },
    [],
  );

  const setSort = useCallback((next: BoardSortMode) => {
    setState((s) => ({ ...s, sort: next }));
  }, []);

  return {
    filters: state.filters,
    sort: state.sort,
    hydrating: state.hydrating,
    setFilters,
    setSort,
  };
}
