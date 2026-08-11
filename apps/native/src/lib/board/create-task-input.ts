import type { TaskPriority } from "@dragons/shared";
import type { TaskCreateBody } from "@dragons/api-client";

/** What the quick-create sheet holds while the user fills it in. */
export interface TaskDraft {
  /** `null` until the board's columns are known — see `buildCreateTaskInput`. */
  columnId: number | null;
  title: string;
  description: string;
  priority: TaskPriority;
  /** YYYY-MM-DD, the server's date column. */
  dueDate: string | null;
}

/**
 * The create body for a draft, or `null` when the draft cannot be submitted.
 *
 * One function for both because they are the same question: a draft that has a
 * title and a column produces a body, and a draft that does not is exactly the
 * draft whose Create button stays disabled.
 *
 * Optional fields are omitted rather than sent as empty/normal/null so the
 * request carries only what the user actually chose; the server defaults the
 * rest.
 */
export function buildCreateTaskInput(draft: TaskDraft): TaskCreateBody | null {
  const title = draft.title.trim();
  if (!title || draft.columnId == null) return null;

  const description = draft.description.trim();
  return {
    columnId: draft.columnId,
    title,
    ...(description ? { description } : {}),
    ...(draft.priority !== "normal" ? { priority: draft.priority } : {}),
    ...(draft.dueDate ? { dueDate: draft.dueDate } : {}),
  };
}
