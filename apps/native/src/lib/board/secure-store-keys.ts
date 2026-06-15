/**
 * Builders for the expo-secure-store keys used by board filter persistence.
 *
 * expo-secure-store rejects any key that is empty or contains a character
 * outside `[A-Za-z0-9._-]`. An earlier scheme used colon separators
 * (`board:<id>:filters`), which threw "Invalid key provided to SecureStore"
 * at runtime on iOS. Keys here use dot separators so they stay valid.
 */

/** Characters expo-secure-store accepts in a key. */
export const SECURE_STORE_KEY_PATTERN = /^[A-Za-z0-9._-]+$/;

/** True when a key is non-empty and uses only SecureStore-legal characters. */
export function isValidSecureStoreKey(key: string): boolean {
  return key.length > 0 && SECURE_STORE_KEY_PATTERN.test(key);
}

/**
 * True when a board id is safe to build storage keys from. Guards against
 * `NaN`/non-integer ids (e.g. a malformed route param) producing useless keys.
 */
export function isPersistableBoardId(boardId: number): boolean {
  return Number.isInteger(boardId) && boardId > 0;
}

export const boardFiltersKey = (boardId: number) => `board.${boardId}.filters`;
export const boardSortKey = (boardId: number) => `board.${boardId}.sort`;
