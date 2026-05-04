import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { auth } from "../config/auth";
import type { Resource, Action, RoleName } from "@dragons/shared";
import { isReferee, can, hasRole } from "@dragons/shared";

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  }
  c.set("user", session.user);
  c.set("session", session.session);
  await next();
};

export function requirePermission<R extends Resource>(
  resource: R,
  action: Action<R>,
): MiddlewareHandler {
  return async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    }
    const result = await auth.api.userHasPermission({
      body: {
        userId: session.user.id,
        permissions: { [resource]: [action] } as Record<string, string[]>,
      },
    });
    if (!result.success) {
      return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403);
    }
    c.set("user", session.user);
    c.set("session", session.session);
    await next();
  };
}

// Throws HTTPException so error middleware can produce the JSON response.
export async function assertPermission<R extends Resource>(
  c: Context,
  resource: R,
  action: Action<R>,
): Promise<void> {
  const user = c.get("user") as { id: string } | undefined;
  if (!user) {
    throw new HTTPException(401, { message: "Unauthorized" });
  }
  const result = await auth.api.userHasPermission({
    body: {
      userId: user.id,
      permissions: { [resource]: [action] } as Record<string, string[]>,
    },
  });
  if (!result.success) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
}

export function requireAnyRole(...names: RoleName[]): MiddlewareHandler {
  return async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    }
    const user = session.user as { role?: string | null };
    if (!names.some((n) => hasRole(user, n))) {
      return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403);
    }
    c.set("user", session.user);
    c.set("session", session.session);
    await next();
  };
}

export const requireRefereeSelf: MiddlewareHandler = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  }
  if (!isReferee(session.user as { refereeId?: number | null })) {
    return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403);
  }
  c.set("user", session.user);
  c.set("session", session.session);
  const refereeId = (session.user as unknown as { refereeId: number }).refereeId;
  c.set("refereeId", refereeId);
  await next();
};

// Permission wins over identity: a user who has the permission sees the full admin
// scope even if they also have a refereeId. refereeId is only set when the user
// qualifies solely as a referee, so downstream services scope queries to self.
export function requireRefereeSelfOrPermission<R extends Resource>(
  resource: R,
  action: Action<R>,
): MiddlewareHandler {
  return async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    }
    const user = session.user as { refereeId?: number | null; role?: string | null };
    const hasPerm = can(user, resource, action);
    if (!hasPerm && !isReferee(user)) {
      return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403);
    }
    c.set("user", session.user);
    c.set("session", session.session);
    if (!hasPerm && isReferee(user)) {
      c.set("refereeId", user.refereeId);
    }
    await next();
  };
}
