import type { Context, MiddlewareHandler } from "hono";
import { auth } from "../config/auth";

export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  }

  if (session.user.role !== "admin") {
    return c.json({ error: "Forbidden", code: "FORBIDDEN" }, 403);
  }

  c.set("user", session.user);
  c.set("session", session.session);
  await next();
};
