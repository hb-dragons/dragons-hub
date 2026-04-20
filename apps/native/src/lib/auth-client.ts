import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";

export function resolveApiUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3001";
  if (!__DEV__ && !url.startsWith("https://")) {
    throw new Error(
      `EXPO_PUBLIC_API_URL must use HTTPS in release builds, got: ${url}`,
    );
  }
  return url;
}

const baseURL = resolveApiUrl();

export const authClient = createAuthClient({
  baseURL,
  plugins: [
    expoClient({
      scheme: "dragons",
      storagePrefix: "dragons",
      cookiePrefix: "dragons",
      storage: SecureStore,
    }),
  ],
});
