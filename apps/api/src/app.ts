import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { openAPIRouteHandler } from "hono-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { errorHandler } from "./middleware/error";
import { corsMiddleware } from "./middleware/cors";
import { requestLogger } from "./middleware/request-logger";
import { requireAuth } from "./middleware/rbac";
import { auth } from "./config/auth";
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

// OpenAPI spec and interactive docs (public, before auth)
app.get("/openapi.json", openAPIRouteHandler(app, { documentation: openApiSpec }));
app.get("/docs", Scalar({ url: "/openapi.json" }));

// Better Auth handler
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Require authentication on all admin routes; per-route guards check granular permissions.
app.use("/admin/*", requireAuth);

app.route("/admin/queues", serverAdapter.registerPlugin());
app.route("/", routes);
app.get("/", (c) => c.json({ service: "api", message: "Hello from Hono" }));
