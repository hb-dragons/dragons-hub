import { createAuthClient } from "better-auth/react";
import { adminClient, inferAdditionalFields } from "better-auth/client/plugins";
import { ac, roles } from "@dragons/shared";

const baseURL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
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
  ],
});
