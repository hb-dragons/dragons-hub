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
      // The web tier calls /get-session server-side (getServerSession) on every
      // admin page load. Those fetches all originate from one Cloud Run egress
      // IP, so the IP-keyed limiter buckets every user together and 429s the
      // whole tier. Exempt it: /get-session is an authenticated, idempotent
      // read — the session token is the credential, nothing to brute-force.
      "/get-session": false,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh daily
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
    // With secondaryStorage configured, better-auth would otherwise store
    // sessions only in Valkey. Memorystore for Valkey is a cluster product
    // and our ioredis client runs in standalone mode against it — single-key
    // ops mostly work but any MOVED redirect or transient failure means a
    // session that briefly appears valid then evaporates on the next read.
    // Mirroring to Postgres gives findSession a fallback (internal-adapter
    // checks Redis first, falls through to the session table when missing).
    storeSessionInDatabase: true,
  },
  advanced: {
    // better-auth auto-prepends `__Secure-` whenever the baseURL is HTTPS
    // (cookies/index.mjs:20,29). Setting that prefix here would double it to
    // `__Secure-__Secure-dragons.session_token` — accepted by browsers but a
    // landmine: the chunked session_data cookie name + payload bumps against
    // header-size ceilings on Cloud Run / GCLB, and cookieCache decode flips
    // to null on the next request.
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
