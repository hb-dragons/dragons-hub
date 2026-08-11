/**
 * The SWR keys for a board's task list.
 *
 * `useBoardTasks` keys on `[prefix, filters]`, so one board can be in the
 * cache several times over — the board screen holds its filtered view while a
 * sheet over it holds the unfiltered one. Every mutation therefore invalidates
 * by *matching* keys rather than naming one, and the prefix both halves agree
 * on lives here instead of in each hook.
 */

export const boardTasksKeyPrefix = (boardId: number): string =>
  `admin/boards/${boardId}/tasks`;

/** SWR key filter matching every filtered variant of one board's task list. */
export function isBoardTasksKey(boardId: number): (key: unknown) => boolean {
  const prefix = boardTasksKeyPrefix(boardId);
  return (key) => Array.isArray(key) && key[0] === prefix;
}
