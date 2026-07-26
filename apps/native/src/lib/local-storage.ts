import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Plain (non-Keychain/Keystore) key-value storage for user preferences that
 * aren't secrets: theme mode, locale, board filter/sort state, and the
 * biometric-lock-enabled flag.
 *
 * `expo-secure-store` round-trips through the OS Keychain/Keystore on every
 * read, which sits on the app's cold-start critical path; iOS Keychain
 * entries also survive app deletion (a stale "biometric enabled" flag would
 * otherwise persist across reinstalls), and Android's SecureStore has a
 * practical value-size ceiling that a large `assigneeIds` filter set could
 * approach. None of these values need hardware-backed storage — only the
 * auth session token does (see `lib/auth-client.ts`, which still uses
 * expo-secure-store).
 */
export const localStorage = {
  getItem: (key: string): Promise<string | null> => AsyncStorage.getItem(key),
  setItem: (key: string, value: string): Promise<void> => AsyncStorage.setItem(key, value),
};
