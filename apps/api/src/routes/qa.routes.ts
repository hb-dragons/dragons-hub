import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { describeRoute, validator } from "hono-openapi";
import type { UIMessage } from "ai";
import type { AppEnv } from "../types";
import { requireAuth } from "../middleware/rbac";
import { rateLimit } from "../middleware/rate-limit";
import { validationHook } from "../middleware/validation";
import { qaChatBodySchema } from "@dragons/contracts";
import { env } from "../config/env";
import { streamClubQaChat } from "../ai/qa/qa-chat";

const qaRoutes = new Hono<AppEnv>();

qaRoutes.post(
  "/chat",
  async (c, next) => {
    if (!env.CHATBOT_ENABLED) {
      return c.json({ error: "Chatbot is disabled", code: "CHATBOT_DISABLED" }, 503);
    }
    return next();
  },
  requireAuth,
  rateLimit({ limit: 20, windowSeconds: 60, keyPrefix: "qa-chat" }),
  // The contract's per-message bounds still admit ~9.6 MB (60 messages x 30
  // parts x 8000 chars), so this is the route's real size gate. Same 512 KB as
  // the reschedule copilot.
  bodyLimit({ maxSize: 512 * 1024 }),
  validator("json", qaChatBodySchema, validationHook),
  describeRoute({
    description: "Stream the members-only club Q&A assistant (AI SDK UI message stream).",
    tags: ["assistant"],
    responses: {
      200: { description: "UI message stream" },
      400: { description: "Bad request" },
      413: { description: "Body too large" },
      429: { description: "Rate limited" },
      503: { description: "Chatbot disabled" },
    },
  }),
  async (c) => {
    const { messages, locale } = c.req.valid("json");
    // The contract validates messages as an opaque non-empty array; the AI SDK
    // validates the UIMessage shape downstream in convertToModelMessages.
    return streamClubQaChat({ messages: messages as UIMessage[], locale });
  },
);

export { qaRoutes };
