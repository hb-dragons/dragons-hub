import { useCallback, useMemo, useState } from "react";
import { applyColumnReorder } from "@dragons/shared";
import type { BoardColumnData } from "@dragons/shared";
import { haptics } from "@/lib/haptics";
import { useColumnMutations } from "./useColumnMutations";

interface ReorderState {
  /** Column id currently lifted; null when not in reorder mode. */
  liftedId: number | null;
  /** Current target index where the lifted column would settle. */
  targetIndex: number | null;
}

export interface UseColumnDragResult {
  liftedColumnId: number | null;
  targetIndex: number | null;
  /** True while a lift is active; pager scroll should be disabled. */
  reordering: boolean;
  /** Begin reorder for the given column (called from header pill long-press). */
  start: (column: BoardColumnData) => void;
  /** Move to a different target index (called as the drag pans across pills). */
  setTargetIndex: (index: number) => void;
  /** Commit current target. */
  commit: () => Promise<void>;
  /** Bail out without persisting. */
  cancel: () => void;
}

export function useColumnDrag(
  boardId: number,
  columns: BoardColumnData[],
): UseColumnDragResult {
  const [state, setState] = useState<ReorderState>({
    liftedId: null,
    targetIndex: null,
  });
  const mutations = useColumnMutations(boardId);

  const sourceIndex = useMemo(() => {
    if (state.liftedId == null) return null;
    const i = columns.findIndex((c) => c.id === state.liftedId);
    return i >= 0 ? i : null;
  }, [columns, state.liftedId]);

  const start = useCallback((column: BoardColumnData) => {
    haptics.medium();
    const idx = columns.findIndex((c) => c.id === column.id);
    if (idx < 0) return;
    setState({ liftedId: column.id, targetIndex: idx });
  }, [columns]);

  const setTargetIndex = useCallback((index: number) => {
    setState((s) => {
      if (s.liftedId == null) return s;
      const clamped = Math.max(0, Math.min(columns.length - 1, index));
      if (clamped === s.targetIndex) return s;
      haptics.selection();
      return { ...s, targetIndex: clamped };
    });
  }, [columns.length]);

  const cancel = useCallback(() => {
    setState({ liftedId: null, targetIndex: null });
  }, []);

  const commit = useCallback(async () => {
    if (state.liftedId == null || state.targetIndex == null || sourceIndex == null) {
      cancel();
      return;
    }
    if (state.targetIndex === sourceIndex) {
      cancel();
      return;
    }

    // Build the new ordering: remove from sourceIndex, insert at targetIndex.
    const reordered = [...columns];
    const [moved] = reordered.splice(sourceIndex, 1);
    if (!moved) {
      cancel();
      return;
    }
    reordered.splice(state.targetIndex, 0, moved);

    // Translate to position deltas. We reassign sequential positions so the
    // wire payload is unambiguous; `applyColumnReorder` is idempotent against
    // sequential positions and matches the server's convention.
    const order = reordered.map((c, i) => ({ id: c.id, position: i }));

    haptics.success();
    cancel();
    try {
      // Result of applyColumnReorder is unused at this point — the SWR
      // revalidation inside reorder() reconciles state. The pure helper is
      // referenced here to make the relationship between the hook and
      // shared logic explicit and to keep the import alive.
      void applyColumnReorder(columns, order);
      await mutations.reorder(order);
    } catch {
      // toast already shown by hook
    }
  }, [cancel, columns, mutations, sourceIndex, state.liftedId, state.targetIndex]);

  return {
    liftedColumnId: state.liftedId,
    targetIndex: state.targetIndex,
    reordering: state.liftedId != null,
    start,
    setTargetIndex,
    commit,
    cancel,
  };
}
