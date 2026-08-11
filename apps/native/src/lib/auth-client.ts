import { createAuthClient } from "better-auth/react";
import { adminClient, inferAdditionalFields } from "better-auth/client/plugins";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { ac, roles, type GateUser } from "@dragons/shared";
import { resolveApiUrl } from "./api-url";

// Re-exported so the many `import { resolveApiUrl } from "@/lib/auth-client"`
// call sites keep working; the implementation lives in `./api-url`, which never
// throws during module evaluation (see the note there).
export { resolveApiUrl } from "./api-url";

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

/**
 * The current user reduced to the shape the shared RBAC catalog gates on
 * ({@link GateUser}: `role` + `refereeId`). Re-runs on session change, so the
 * shell reshapes after sign-in/out. Use this instead of casting `useSession`.
 */
export function useGateUser(): GateUser {
  const { data: session } = authClient.useSession();
  return (session?.user ?? null) as GateUser;
}
