import { z } from "zod";

/**
 * Bounds on the reschedule assistant chat body.
 *
 * `messages` used to be `z.array(z.unknown())` fed straight to an LLM, so a
 * single authenticated caller could post an unbounded array of arbitrary
 * values. The AI SDK still validates the full `UIMessage` shape downstream in
 * `convertToModelMessages`; what matters here is that the request is finite and
 * message-shaped before any of it reaches a model.
 */
const MAX_MESSAGES = 60;
const MAX_TEXT_CHARS = 8000;

/**
 * Derived from `chat.ts`'s `stopWhen: stepCountIs(8)` — this route's tool loop
 * can run up to 8 steps against `reschedTools` (7 tools), unlike `qa.ts`'s
 * chat, which stops at 5 steps against a smaller tool set (`qa-tools.ts`
 * defines 3: `get_dashboard`, `get_standings`, `list_matches`). Every step boundary
 * materialises as its own `step-start` part on the assistant `UIMessage`, and
 * a step can add several parallel `tool-*` parts (Gemini can call more than
 * one tool per step) plus text. 8 steps x (1 step-start + up to ~4 tool-call
 * parts) + a trailing text part ~= 48. Copying `qa.ts`'s value of 20 here
 * would let a full tool-heavy turn overflow the bound: `useChat` keeps that
 * oversized assistant message in state, and `DefaultChatTransport` re-sends
 * the whole list on every subsequent turn, so the chat gets stuck 400ing until
 * the page reloads. If `stepCountIs()` in `chat.ts` or the tool count changes
 * materially, re-derive this.
 */
const MAX_PARTS_PER_MESSAGE = 48;

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
 * `regenerate()`) `messageId` to whatever `body` the caller configured. The web
 * copilot uses it unmodified, so leaving these out makes every single chat
 * request a 400.
 *
 * `assistant-chat-transport.contract.test.ts` drives the real transport and
 * asserts the body it produces parses against this schema, so an AI-SDK
 * upgrade that changes the envelope fails the build instead of the chat.
 */
export const assistantRescheduleChatBodySchema = z.strictObject({
  messages: z.array(uiMessageSchema).min(1).max(MAX_MESSAGES),
  matchId: z.number().int().positive().optional(),

  // ── AI SDK transport envelope ─────────────────────────────────────────────
  /** Chat id. Not read by the route; the event id is minted server-side. */
  id: z.string().max(200).optional(),
  /** "submit-message" | "regenerate-message" | "resume-stream" as of ai@6. */
  trigger: z.string().max(50).optional(),
  /** Set only when regenerating a specific assistant message. */
  messageId: z.string().max(200).optional(),
});

export type AssistantRescheduleChatBody = z.infer<
  typeof assistantRescheduleChatBodySchema
>;
