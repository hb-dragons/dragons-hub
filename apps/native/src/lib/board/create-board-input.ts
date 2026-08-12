import type { BoardCreateBody } from "@dragons/api-client";

/** What the create-board sheet holds while the user fills it in. */
export interface BoardDraft {
  name: string;
  description: string;
}

/**
 * The create body for a draft board, or `null` when the draft cannot be
 * submitted.
 *
 * One function for both, for the same reason `buildCreateTaskInput` is one
 * (#222): a draft that has a name produces a body, and a draft that does not is
 * exactly the draft whose Create button stays disabled.
 *
 * A blank description is omitted rather than sent as `null`, so a board created
 * with nothing but a name posts nothing but a name.
 */
export function buildCreateBoardInput(draft: BoardDraft): BoardCreateBody | null {
  const name = draft.name.trim();
  if (!name) return null;

  const description = draft.description.trim();
  return { name, ...(description ? { description } : {}) };
}
