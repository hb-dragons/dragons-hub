/**
 * Builders for the storage keys used by board filter persistence
 * (`@/lib/local-storage`, backed by AsyncStorage).
 *
 * These were originally expo-secure-store keys, which reject any key that is
 * empty or contains a character outside `[A-Za-z0-9._-]`. An earlier scheme
 * used colon separators (`board:<id>:filters`), which threw "Invalid key
 * provided to SecureStore" at runtime on iOS. Keys here still use dot
 * separators — AsyncStorage doesn't require it, but there's no reason to
 * reintroduce colons now that the constraint is gone.
 */

/**
 * True when a board id is safe to build storage keys from. Guards against
 * `NaN`/non-integer ids (e.g. a malformed route param) producing useless keys.
 */
export function isPersistableBoardId(boardId: number): boolean {
  return Number.isInteger(boardId) && boardId > 0;
}

export const boardFiltersKey = (boardId: number) => `board.${boardId}.filters`;
export const boardSortKey = (boardId: number) => `board.${boardId}.sort`;
