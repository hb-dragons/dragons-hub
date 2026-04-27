/**
 * Pure helpers for assembling undo state for destructive board operations.
 * Used by the native (and eventually web) toast-undo flow: when the user
 * deletes a task / checklist item / comment, we build an UndoEntry, show
 * a toast with an "Undo" action, and on tap we re-create the entity from
 * the snapshot via the API.
 *
 * Kept pure (no React, no SWR) so it lives in @dragons/shared and runs
 * under vitest.
 */

export interface UndoableTaskSnapshot {
  kind: "task";
  taskId: number;
  columnId: number;
  position: number;
  title: string;
}

export interface UndoableChecklistSnapshot {
  kind: "checklist";
  taskId: number;
  itemId: number;
  label: string;
  isChecked: boolean;
  position: number;
}

export interface UndoableCommentSnapshot {
  kind: "comment";
  taskId: number;
  commentId: number;
  body: string;
  createdAt: string;
  authorId: string;
}

export type UndoableSnapshot =
  | UndoableTaskSnapshot
  | UndoableChecklistSnapshot
  | UndoableCommentSnapshot;

export interface UndoEntry {
  kind: UndoableSnapshot["kind"];
  snapshot: UndoableSnapshot;
  expiresAtMs: number;
}

const DEFAULT_TTL_MS = 5_000;

export function buildUndoEntry(
  snapshot: UndoableSnapshot,
  options?: { ttlMs?: number },
): UndoEntry {
  const ttl = options?.ttlMs ?? DEFAULT_TTL_MS;
  return {
    kind: snapshot.kind,
    snapshot,
    expiresAtMs: Date.now() + ttl,
  };
}
