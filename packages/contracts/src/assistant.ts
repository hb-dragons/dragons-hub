import { z } from "zod";
import { chatBodySchema } from "./chat-body";

/**
 * Per-message part bound for the reschedule copilot.
 *
 * This is the route's theoretical maximum, not an estimate. `chat.ts` runs
 * `stopWhen: stepCountIs(RESCHEDULE_STEP_BUDGET)` (8) against `reschedTools`
 * (7 tools), and a single step can add at most:
 *
 *   1 `step-start` + 7 `tool-*` (all tools called in parallel)
 *   + 1 `text` + 1 `reasoning` = 10 parts
 *
 * 8 steps x 10 = 80. The earlier value of 48 assumed ~4 parallel tool calls per
 * step and no reasoning parts; a turn that fanned out wider would have produced
 * an assistant message this schema rejects, and a rejected assistant message is
 * unrecoverable from the client — `useChat` keeps it in state and
 * `DefaultChatTransport` re-sends the whole list every turn, so the chat 400s on
 * every subsequent send until the page reloads. Nothing in the web copilot
 * clears the transcript. Deriving the ceiling instead of estimating it removes
 * the guess; `apps/api/src/ai/chat-part-budget.test.ts` re-derives it from the
 * live step budget and tool list, so adding a tool or raising the step count
 * fails the build here rather than dead-ending the chat in production.
 */
const MAX_PARTS_PER_MESSAGE = 80;

export const assistantRescheduleChatBodySchema = chatBodySchema({
  maxPartsPerMessage: MAX_PARTS_PER_MESSAGE,
  extra: { matchId: z.number().int().positive().optional() },
});

export type AssistantRescheduleChatBody = z.infer<
  typeof assistantRescheduleChatBodySchema
>;
