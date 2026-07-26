import { z } from "zod";

/**
 * Bounds on the club Q&A chat body.
 *
 * `messages` used to be `z.array(z.unknown()).min(1)` fed straight to an LLM, so
 * a single authenticated member could post an unbounded array of arbitrary
 * values. The AI SDK still validates the full `UIMessage` shape downstream in
 * `convertToModelMessages`; what matters here is that the request is finite and
 * message-shaped before any of it reaches a model.
 */
const MAX_MESSAGES = 60;
const MAX_PARTS_PER_MESSAGE = 20;
const MAX_TEXT_CHARS = 8000;

/**
 * `looseObject`, not `strictObject`: the AI SDK adds fields to `UIMessage` and
 * its parts between releases, and rejecting an unrecognised one would break chat
 * for a change that costs nothing. The size limits are what this is here for.
 */
const uiMessagePartSchema = z.looseObject({
  type: z.string().min(1).max(100),
  text: z.string().max(MAX_TEXT_CHARS).optional(),
});

const uiMessageSchema = z.looseObject({
  id: z.string().max(200).optional(),
  role: z.enum(["system", "user", "assistant"]),
  parts: z.array(uiMessagePartSchema).max(MAX_PARTS_PER_MESSAGE),
});

/**
 * The body is strict, so the AI SDK's own transport envelope has to be declared
 * here: `DefaultChatTransport.sendMessages` appends `id`, `trigger` and (on
 * `regenerate()`) `messageId` to whatever `body` the caller configured. Both the
 * web widget and the native screen use it unmodified, so leaving these out makes
 * every single chat request a 400.
 *
 * `qa-chat-transport.contract.test.ts` drives the real transport and asserts the
 * body it produces parses against this schema, so an AI-SDK upgrade that changes
 * the envelope fails the build instead of the chat.
 */
export const qaChatBodySchema = z.strictObject({
  messages: z.array(uiMessageSchema).min(1).max(MAX_MESSAGES),
  locale: z.string().min(2).max(15).optional(),

  // ── AI SDK transport envelope ─────────────────────────────────────────────
  /** Chat id. Not read by the route; the event id is minted server-side. */
  id: z.string().max(200).optional(),
  /** "submit-message" | "regenerate-message" | "resume-stream" as of ai@6. */
  trigger: z.string().max(50).optional(),
  /** Set only when regenerating a specific assistant message. */
  messageId: z.string().max(200).optional(),
});

export type QaChatBody = z.infer<typeof qaChatBodySchema>;
