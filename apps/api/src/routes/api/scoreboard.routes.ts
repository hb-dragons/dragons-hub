import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { describeRoute } from "hono-openapi";
import { requireIngestKey } from "../../middleware/ingest-key";
import { processIngest } from "../../services/scoreboard/ingest";

const apiScoreboardRoutes = new Hono();

apiScoreboardRoutes.post(
  "/ingest",
  requireIngestKey,
  bodyLimit({
    maxSize: 8 * 1024,
    onError: (c) =>
      c.json({ error: "Body too large", code: "BODY_TOO_LARGE" }, 413),
  }),
  describeRoute({
    description: "Stramatel raw-hex ingest from Raspberry Pi",
    tags: ["Scoreboard"],
    responses: {
      200: { description: "Frame accepted" },
      400: { description: "Bad device id" },
      401: { description: "Unauthorized" },
      413: { description: "Body too large" },
      429: { description: "Rate limited" },
    },
  }),
  async (c) => {
    const hex = (await c.req.text()).trim();
    const deviceId = c.req.header("device_id") ?? c.req.header("Device_ID")!;
    const result = await processIngest({ deviceId, hex });
    return c.json(result);
  },
);

export { apiScoreboardRoutes };
