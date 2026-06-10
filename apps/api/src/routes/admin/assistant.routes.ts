import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import type { UIMessage } from "ai";
import type { AppEnv } from "../../types";
import { requirePermission } from "../../middleware/rbac";
import { env } from "../../config/env";
import { streamRescheduleChat } from "../../ai/chat";

const bodySchema = z.object({
  messages: z.array(z.unknown()),
  matchId: z.number().int().positive().optional(),
});

const assistantRoutes = new Hono<AppEnv>();

assistantRoutes.post(
  "/assistant/reschedule/chat",
  requirePermission("match", "update"),
  describeRoute({
    description: "Stream the rescheduling copilot chat (AI SDK UI message stream).",
    tags: ["assistant"],
    responses: { 200: { description: "UI message stream" }, 503: { description: "Assistant disabled" } },
  }),
  async (c) => {
    if (!env.ASSISTANT_ENABLED) {
      return c.json({ error: "Assistant is disabled", code: "ASSISTANT_DISABLED" }, 503);
    }
    const body = bodySchema.parse(await c.req.json());
    return streamRescheduleChat(body.messages as UIMessage[], body.matchId);
  },
);

export { assistantRoutes };
