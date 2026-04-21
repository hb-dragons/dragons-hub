import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins/admin";
import { ac, roles } from "@dragons/shared";
import { db } from "./database";
import { env } from "./env";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [
    ...env.TRUSTED_ORIGINS,
    "dragons://",
    "dragons://*",
    ...(env.NODE_ENV === "development" ? ["exp://*"] : []),
  ],
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh daily
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },
  advanced: {
    cookiePrefix: "dragons",
    crossSubDomainCookies:
      env.NODE_ENV === "production"
        ? { enabled: true, domain: ".app.hbdragons.de" }
        : { enabled: false },
    defaultCookieAttributes: {
      sameSite: "lax",
      httpOnly: true,
      secure: env.NODE_ENV === "production",
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Better-auth's admin plugin injects a create.before hook that sets
        // `role` to its `defaultRole` ("user" when unspecified). We treat
        // role = null as the absence of any RBAC roles (see packages/shared/src/rbac.ts),
        // so strip the injected "user" default back to null. User hooks run
        // after plugin hooks, and the returned `data` is shallow-merged on top,
        // so this overrides the plugin's default cleanly.
        before: async (user) => {
          if ((user as { role?: string | null }).role === "user") {
            return { data: { ...user, role: null } };
          }
          return { data: user };
        },
      },
    },
  },
  plugins: [
    admin({
      ac,
      roles,
      adminRoles: ["admin"],
    }),
    expo(),
  ],
});
