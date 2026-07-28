import { z } from "zod";
import { chatBodySchema } from "./chat-body";

/**
 * Per-message part bound for the club Q&A chat.
 *
 * `qa-chat.ts` runs `stopWhen: stepCountIs(5)` against `qa-tools.ts` (3 tools:
 * `get_dashboard`, `get_standings`, `list_matches`). Each step adds a
 * `step-start` part plus one `tool-*` part per tool called in that step plus at
 * most one `text` part, so the theoretical worst case is 5 x (1 + 3 + 1) = 25 —
 * above this bound. 20 is kept because a three-tool chat answering a club
 * question does not fan out that far in practice: a normal turn is one or two
 * tool calls and an answer, well inside 20. `assistant.ts` sets its bound at the
 * theoretical maximum instead, because that route's loop is eight times wider
 * and got this wrong once already. See `chat-body.ts` for why the bound is an
 * explicit argument per route rather than a shared constant.
 */
const MAX_PARTS_PER_MESSAGE = 20;

export const qaChatBodySchema = chatBodySchema({
  maxPartsPerMessage: MAX_PARTS_PER_MESSAGE,
  extra: { locale: z.string().min(2).max(15).optional() },
});

export type QaChatBody = z.infer<typeof qaChatBodySchema>;
