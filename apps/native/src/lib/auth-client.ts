import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { ac, roles } from "@dragons/shared";

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
    adminClient({ ac, roles }),
    expoClient({
      scheme: "dragons",
      storagePrefix: "dragons",
      cookiePrefix: "dragons",
      storage: SecureStore,
    }),
  ],
});
