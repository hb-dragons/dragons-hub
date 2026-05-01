import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { buildBroadcastState } from "../../services/broadcast/publisher";
import { subscribeBroadcast } from "../../services/scoreboard/pubsub";

const HEARTBEAT_MS = 15_000;

const publicBroadcastRoutes = new Hono();

publicBroadcastRoutes.get(
  "/state",
  describeRoute({
    description: "Current broadcast state for a device",
    tags: ["Broadcast"],
    responses: {
      200: { description: "Broadcast state" },
      400: { description: "Bad request" },
    },
  }),
  async (c) => {
    const deviceId = c.req.query("deviceId");
    if (!deviceId) {
      return c.json({ error: "deviceId required", code: "BAD_REQUEST" }, 400);
    }
    const state = await buildBroadcastState(deviceId);
    c.header("Cache-Control", "no-store");
    return c.json(state);
  },
);

publicBroadcastRoutes.get(
  "/stream",
  describeRoute({
    description: "SSE stream of broadcast state changes",
    tags: ["Broadcast"],
    responses: { 200: { description: "text/event-stream" } },
  }),
  async (c) => {
    const deviceId = c.req.query("deviceId");
    if (!deviceId) {
      return c.json({ error: "deviceId required", code: "BAD_REQUEST" }, 400);
    }

    const encoder = new TextEncoder();
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let unsubscribe: (() => Promise<void>) | undefined;
    let cancelled = false;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        function safe(text: string) {
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            // closed
          }
        }
        safe("retry: 2000\n\n");

        const initial = await buildBroadcastState(deviceId);
        if (cancelled) return;
        safe(`event: snapshot\ndata: ${JSON.stringify(initial)}\n\n`);

        const sub = await subscribeBroadcast(deviceId, (state) => {
          safe(`event: snapshot\ndata: ${JSON.stringify(state)}\n\n`);
        });
        if (cancelled) {
          await sub();
          return;
        }
        unsubscribe = sub;

        heartbeat = setInterval(() => safe(": ping\n\n"), HEARTBEAT_MS);
      },
      async cancel() {
        cancelled = true;
        if (heartbeat) clearInterval(heartbeat);
        if (unsubscribe) await unsubscribe();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      },
    });
  },
);

export { publicBroadcastRoutes };
