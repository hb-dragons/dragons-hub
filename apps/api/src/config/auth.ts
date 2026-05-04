import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins/admin";
import { ac, roles } from "@dragons/shared";
import { db } from "./database";
import { env } from "./env";
import { redis } from "./redis";

const SECONDARY_STORAGE_PREFIX = "ba:";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [
    ...env.TRUSTED_ORIGINS,
    "dragons://*",
    ...(env.NODE_ENV === "development" ? ["exp://*"] : []),
  ],
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
  },
  secondaryStorage: {
    async get(key) {
      return redis.get(`${SECONDARY_STORAGE_PREFIX}${key}`);
    },
    async set(key, value, ttl) {
      const k = `${SECONDARY_STORAGE_PREFIX}${key}`;
      if (ttl && ttl > 0) await redis.set(k, value, "EX", ttl);
      else await redis.set(k, value);
    },
    async delete(key) {
      await redis.del(`${SECONDARY_STORAGE_PREFIX}${key}`);
    },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
      "/forget-password": { window: 60, max: 3 },
      "/reset-password": { window: 60, max: 5 },
    },
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
  user: {
    // Without this declaration, parseUserOutput strips refereeId from
    // getSession / admin.listUsers responses.
    additionalFields: {
      refereeId: {
        type: "number",
        required: false,
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Undo the admin plugin's defaultRole = "user" injection; role = null
        // means "no RBAC roles" in this codebase.
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
