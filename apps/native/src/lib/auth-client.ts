import { createAuthClient } from "better-auth/react";
import { adminClient, inferAdditionalFields } from "better-auth/client/plugins";
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
type AdminPluginOptions = NonNullable<Parameters<typeof adminClient>[0]>;
const adminPluginConfig = {
  ac: ac as AdminPluginOptions["ac"],
  roles: roles as AdminPluginOptions["roles"],
};

export const authClient = createAuthClient({
  baseURL,
  plugins: [
    inferAdditionalFields({
      user: {
        refereeId: { type: "number", required: false },
      },
    }),
    adminClient(adminPluginConfig),
    expoClient({
      scheme: "dragons",
      storagePrefix: "dragons",
      cookiePrefix: "dragons",
      storage: SecureStore,
    }),
  ],
});
