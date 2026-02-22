import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { errorHandler } from "./middleware/error";
import { corsMiddleware } from "./middleware/cors";
import { requireAdmin } from "./middleware/auth";
import { auth } from "./config/auth";
import { routes } from "./routes/index";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import { syncQueue } from "./workers/queues";

export const app = new Hono();

// Bull Board Admin UI
const serverAdapter = new HonoAdapter(serveStatic);
serverAdapter.setBasePath("/admin/queues");
createBullBoard({
  queues: [new BullMQAdapter(syncQueue)],
  serverAdapter,
});

app.use("*", corsMiddleware);
app.onError(errorHandler);

// Better Auth handler
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Protect all admin routes
app.use("/admin/*", requireAdmin);

app.route("/admin/queues", serverAdapter.registerPlugin());
app.route("/", routes);
app.get("/", (c) => c.json({ service: "api", message: "Hello from Hono" }));
