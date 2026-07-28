import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { describeRoute, validator } from "hono-openapi";
import type { UIMessage } from "ai";
import type { AppEnv } from "../../types";
import { requirePermission } from "../../middleware/rbac";
import { rateLimit } from "../../middleware/rate-limit";
import { validationHook } from "../../middleware/validation";
import { assistantRescheduleChatBodySchema } from "@dragons/contracts";
import { env } from "../../config/env";
import { streamRescheduleChat } from "../../ai/chat";

const assistantRoutes = new Hono<AppEnv>();

assistantRoutes.post(
  "/assistant/reschedule/chat",
  async (c, next) => {
    if (!env.ASSISTANT_ENABLED) {
      return c.json({ error: "Assistant is disabled", code: "ASSISTANT_DISABLED" }, 503);
    }
    return next();
  },
  requirePermission("match", "update"),
  rateLimit({ limit: 20, windowSeconds: 60, keyPrefix: "assistant-reschedule" }),
  bodyLimit({ maxSize: 512 * 1024 }),
  validator("json", assistantRescheduleChatBodySchema, validationHook),
  describeRoute({
    description: "Stream the rescheduling copilot chat (AI SDK UI message stream).",
    tags: ["assistant"],
    responses: {
      200: { description: "UI message stream" },
      400: { description: "Bad request" },
      413: { description: "Body too large" },
      429: { description: "Rate limited" },
      503: { description: "Assistant disabled" },
    },
  }),
  async (c) => {
    const { messages, matchId } = c.req.valid("json");
    // The contract validates messages as an opaque bounded array; the AI SDK
    // validates the UIMessage shape downstream in convertToModelMessages.
    return streamRescheduleChat(messages as UIMessage[], matchId);
  },
);

export { assistantRoutes };
