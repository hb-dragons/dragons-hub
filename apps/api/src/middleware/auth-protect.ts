import type { MiddlewareHandler } from "hono";
import { redis } from "../config/redis";
import type { AppEnv } from "../types";

const FAIL_WINDOW_SEC = 15 * 60;
const FAIL_THRESHOLD = 10;
const LOCKOUT_SEC = 30 * 60;

function lastForwardedFor(value: string | undefined): string | null {
  if (!value) return null;
  const parts = value.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length === 0 ? null : parts[parts.length - 1]!;
}

export const trustForwardedFor: MiddlewareHandler<AppEnv> = async (c, next) => {
  const xff = c.req.header("x-forwarded-for");
  const last = lastForwardedFor(xff);
  if (last !== null) {
    c.req.raw.headers.set("x-forwarded-for", last);
  }
  await next();
};

function failKey(email: string): string {
  return `auth:fail:${email.toLowerCase()}`;
}

function lockKey(email: string): string {
  return `auth:lock:${email.toLowerCase()}`;
}

export async function isLockedOut(email: string): Promise<boolean> {
  const v = await redis.get(lockKey(email));
  return v !== null;
}

export async function recordAuthFailure(email: string): Promise<void> {
  const key = failKey(email);
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, FAIL_WINDOW_SEC);
  if (count >= FAIL_THRESHOLD) {
    await redis.set(lockKey(email), "1", "EX", LOCKOUT_SEC);
    await redis.del(key);
  }
}

export async function clearAuthFailures(email: string): Promise<void> {
  await redis.del(failKey(email), lockKey(email));
}

export const signInLockout: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.req.method !== "POST") return next();
  const path = new URL(c.req.url).pathname;
  if (!path.endsWith("/sign-in/email")) return next();

  let email: string | undefined;
  try {
    const body = await c.req.raw.clone().json();
    if (body && typeof body === "object" && typeof (body as { email?: unknown }).email === "string") {
      email = (body as { email: string }).email;
    }
  } catch {
    // body unreadable — let better-auth reject it
  }

  if (email && (await isLockedOut(email))) {
    return c.json({ error: "Too many failed attempts. Try again later." }, 429);
  }

  await next();

  if (!email) return;

  const status = c.res.status;
  if (status === 200 || status === 201) {
    await clearAuthFailures(email);
  } else if (status === 401 || status === 400 || status === 403) {
    await recordAuthFailure(email);
  }
};
