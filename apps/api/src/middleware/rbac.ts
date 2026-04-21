import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { auth } from "../config/auth";
import type { Resource, Action } from "@dragons/shared";
import { isReferee } from "@dragons/shared";

// Authenticate the request; populate c.vars with user + session. 401 on no session.
export const requireAuth: MiddlewareHandler = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  }
  c.set("user", session.user);
  c.set("session", session.session);
  await next();
};

// Permission gate for route-groups. 401 on no session, 403 if permission denied.
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

// Inline permission assertion for row-level / dynamic checks inside a handler.
// Throws via HTTPException so Hono's error middleware responds with JSON.
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

// Self-service gate for referee routes. Populates c.get("refereeId"). 403 if not linked.
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
