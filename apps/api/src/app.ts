import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { openAPIRouteHandler } from "hono-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { errorHandler } from "./middleware/error";
import { corsMiddleware } from "./middleware/cors";
import { requestLogger } from "./middleware/request-logger";
import { requireAuth, requireAnyRole } from "./middleware/rbac";
import { trustForwardedFor, signInLockout } from "./middleware/auth-protect";
import { auth } from "./config/auth";
import { env } from "./config/env";
import { openApiSpec } from "./config/openapi";
import { routes } from "./routes/index";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import { syncQueue } from "./workers/queues";
import type { AppEnv } from "./types";

export const app = new Hono<AppEnv>();

// Bull Board Admin UI
const serverAdapter = new HonoAdapter(serveStatic);
serverAdapter.setBasePath("/admin/queues");
createBullBoard({
  queues: [new BullMQAdapter(syncQueue)],
  serverAdapter,
});

app.use("*", corsMiddleware);
app.use("*", requestLogger);
app.onError(errorHandler);

const docsHandler = openAPIRouteHandler(app, { documentation: openApiSpec });
const scalarHandler = Scalar({ url: "/openapi.json" });
if (env.NODE_ENV === "production") {
  app.get("/openapi.json", requireAuth, requireAnyRole("admin"), docsHandler);
  app.get("/docs", requireAuth, requireAnyRole("admin"), scalarHandler);
} else {
  app.get("/openapi.json", docsHandler);
  app.get("/docs", scalarHandler);
}

app.use("/api/auth/*", trustForwardedFor);
app.use("/api/auth/sign-in/email", signInLockout);
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Require authentication on all admin routes; per-route guards check granular permissions.
app.use("/admin/*", requireAuth);

// Bull Board queue dashboard: admin role only. Must come before the route
// mount so the middleware runs first.
app.use("/admin/queues/*", requireAnyRole("admin"));
app.route("/admin/queues", serverAdapter.registerPlugin());
app.route("/", routes);
app.get("/", (c) => c.json({ service: "api", message: "Hello from Hono" }));
