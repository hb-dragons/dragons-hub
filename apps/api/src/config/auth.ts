import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins/admin";
import { ac, roles } from "@dragons/shared";
import { getDb } from "./database";
import { env } from "./env";
import { logger } from "./logger";
import { getRedis } from "./redis";

const SECONDARY_STORAGE_PREFIX = "ba:";

/**
 * The cookie domain that lets the API and the web app share a session, derived
 * from `BETTER_AUTH_URL` rather than hardcoded. The literal `.app.hbdragons.de`
 * that used to sit here was correct only as long as nobody moved the API: point
 * `BETTER_AUTH_URL` at another host and every session cookie is scoped to a
 * domain the browser will not send it back to, which reads as "signed out on
 * every request" with nothing logged.
 *
 * The service label is dropped so `api.app.example.de` yields `.app.example.de`
 * and the sibling web host sees the same cookie. Hosts with no parent to scope
 * to — a bare `localhost`, an IP literal, an unparseable URL — return
 * `undefined`, and the caller leaves cross-subdomain cookies off instead of
 * emitting a domain the browser would reject.
 */
export function deriveCookieDomain(baseUrl: string): string | undefined {
  let hostname: string;
  try {
    hostname = new URL(baseUrl).hostname;
  } catch {
    return undefined;
  }

  // `URL` keeps IPv6 literals bracketed; neither form has a parent domain.
  if (hostname.startsWith("[") || /^\d+(\.\d+)*$/.test(hostname)) return undefined;

  const labels = hostname.split(".").filter(Boolean);
  if (labels.length < 2) return undefined;

  const scope = labels.length > 2 ? labels.slice(1) : labels;
  return `.${scope.join(".")}`;
}

const cookieDomain =
  env.NODE_ENV === "production" ? deriveCookieDomain(env.BETTER_AUTH_URL) : undefined;

export const auth = betterAuth({
  database: drizzleAdapter(getDb(), { provider: "pg" }),
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
  // Every getSession hits secondaryStorage once the 5-minute cookie cache
  // lapses, so a Redis outage here would otherwise take down every
  // authenticated route. Degrade instead: a read failure reports a cache miss
  // and better-auth falls through to the mirrored session table
  // (storeSessionInDatabase below); a write failure is logged and swallowed,
  // since Postgres already holds the durable copy and throwing would turn a
  // cache outage into a sign-in outage.
  secondaryStorage: {
    async get(key) {
      try {
        return await getRedis().get(`${SECONDARY_STORAGE_PREFIX}${key}`);
      } catch (err) {
        logger.warn({ err, key }, "Session cache read failed; treating as a miss");
        return null;
      }
    },
    async set(key, value, ttl) {
      const k = `${SECONDARY_STORAGE_PREFIX}${key}`;
      try {
        if (ttl && ttl > 0) await getRedis().set(k, value, "EX", ttl);
        else await getRedis().set(k, value);
      } catch (err) {
        logger.warn({ err, key }, "Session cache write failed; skipping cache");
      }
    },
    async delete(key) {
      try {
        await getRedis().del(`${SECONDARY_STORAGE_PREFIX}${key}`);
      } catch (err) {
        logger.warn({ err, key }, "Session cache delete failed; entry will expire via TTL");
      }
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
    crossSubDomainCookies: cookieDomain
      ? { enabled: true, domain: cookieDomain }
      : { enabled: false },
    defaultCookieAttributes: {
      sameSite: "lax",
      httpOnly: true,
      secure: env.NODE_ENV === "production",
    },
  },
  user: {
    // Without this declaration, parseUserOutput strips refereeId and staffId
    // from getSession / admin.listUsers responses.
    additionalFields: {
      refereeId: {
        type: "number",
        required: false,
        input: false,
      },
      staffId: {
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
      adminRoles: ["admin", "superadmin"],
    }),
    expo(),
  ],
});
