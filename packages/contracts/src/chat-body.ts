import { z } from "zod";

/**
 * The request body shape shared by every AI SDK chat endpoint.
 *
 * Package-internal: routes import their own named schema from `index.ts`, built
 * here. `qa.ts` and `assistant.ts` were character-for-character identical apart
 * from one number, and that number is the one that has already been copied
 * wrong once (see `assistant.ts`). Everything invariant lives here; everything
 * per-route is an argument to `chatBodySchema`.
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
 * `looseObject`, not `strictObject`: the AI SDK adds fields to `UIMessage` and
 * its parts between releases, and rejecting an unrecognised one would break chat
 * for a change that costs nothing. The size limits are what this is here for.
 */
const uiMessagePartSchema = z.looseObject({
  type: z.string().min(1).max(100),
  text: z.string().max(MAX_TEXT_CHARS).optional(),
});

const uiMessageSchema = (maxPartsPerMessage: number) =>
  z.looseObject({
    id: z.string().max(200).optional(),
    role: z.enum(["system", "user", "assistant"]),
    parts: z.array(uiMessagePartSchema).max(maxPartsPerMessage),
  });

/**
 * Build the strict request body schema for a chat route.
 *
 * `maxPartsPerMessage` is required and has no default on purpose. It is the one
 * bound that cannot be shared: it has to be re-derived per route from that
 * route's step budget and tool count, because every step boundary materialises
 * as its own `step-start` part on the assistant `UIMessage` and a step can add
 * one `tool-*` part per tool called in parallel. Get it too low and a tool-heavy
 * turn produces an assistant message the schema rejects — `useChat` keeps that
 * message in state and `DefaultChatTransport` re-sends the whole list every
 * turn, so the chat 400s on every subsequent send until the page reloads.
 * A default here would be a value to copy, which is exactly how that bug got in.
 *
 * The body is strict, so the AI SDK's own transport envelope has to be declared:
 * `DefaultChatTransport.sendMessages` appends `id`, `trigger` and (on
 * `regenerate()`) `messageId` to whatever `body` the caller configured. Every
 * client uses the transport unmodified, so leaving these out makes every single
 * chat request a 400. `qa-chat-transport.contract.test.ts` and
 * `assistant-chat-transport.contract.test.ts` drive the real transport and
 * assert the body it produces parses, so an AI-SDK upgrade that changes the
 * envelope fails the build instead of the chat.
 *
 * `extra` is spread first so a route can never shadow `messages` or an envelope
 * key by accident.
 */
export function chatBodySchema<Extra extends z.ZodRawShape>(opts: {
  maxPartsPerMessage: number;
  extra: Extra;
}) {
  return z.strictObject({
    ...opts.extra,
    messages: z.array(uiMessageSchema(opts.maxPartsPerMessage)).min(1).max(MAX_MESSAGES),

    // ── AI SDK transport envelope ─────────────────────────────────────────────
    /** Chat id. Not read by any route; the event id is minted server-side. */
    id: z.string().max(200).optional(),
    /** "submit-message" | "regenerate-message" | "resume-stream" as of ai@6. */
    trigger: z.string().max(50).optional(),
    /** Set only when regenerating a specific assistant message. */
    messageId: z.string().max(200).optional(),
  });
}
