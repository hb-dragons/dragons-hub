import type { TaskCardData, TaskPriority } from "@dragons/shared";
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

/**
 * The create body that puts a deleted task back — what the undo action on the
 * delete toast sends (#220).
 *
 * The opposite convention to a draft: every field is stated, including the
 * ones a draft omits, because undo has to hand back the task that was there
 * rather than a task the server defaulted. Assignees come with it; the
 * checklist and the comments cannot, since the create endpoint takes neither
 * and the rows went with the task.
 */
export function restoreTaskInput(task: TaskCardData): TaskCreateBody {
  return {
    columnId: task.columnId,
    title: task.title,
    description: task.description,
    priority: task.priority,
    dueDate: task.dueDate,
    assigneeIds: task.assignees.map((assignee) => assignee.userId),
  };
}
