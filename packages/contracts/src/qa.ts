import { z } from "zod";
import { chatBodySchema } from "./chat-body";

/**
 * Per-message part bound for the club Q&A chat.
 *
 * This is the route's theoretical maximum, not an estimate. `qa-chat.ts` runs
 * `stopWhen: stepCountIs(QA_STEP_BUDGET)` (5) against `qaTools` (3 tools:
 * `get_dashboard`, `get_standings`, `list_matches`), and a single step can add
 * at most:
 *
 *   1 `step-start` + 3 `tool-*` (all tools called in parallel)
 *   + 1 `text` + 1 `reasoning` = 6 parts
 *
 * 5 steps x 6 = 30. The earlier value of 20 was a deliberate under-estimate,
 * kept on the grounds that a three-tool club-info chat does not fan out that far
 * in practice. That traded a cheap number for an expensive failure: a rejected
 * assistant message is unrecoverable from the client — `useChat` keeps it in
 * state and `DefaultChatTransport` re-sends the whole list every turn, so the
 * chat 400s on every subsequent send until the page reloads. The tighter bound
 * was also not gating anything, since the route's real size limit is the
 * `bodyLimit` middleware. `apps/api/src/ai/chat-part-budget.test.ts` re-derives
 * this from the live step budget and tool list, so adding a tool or raising the
 * step count fails the build here rather than dead-ending the chat in
 * production. See `chat-body.ts` for why the bound is an explicit argument per
 * route rather than a shared constant.
 */
const MAX_PARTS_PER_MESSAGE = 30;

export const qaChatBodySchema = chatBodySchema({
  maxPartsPerMessage: MAX_PARTS_PER_MESSAGE,
  extra: { locale: z.string().min(2).max(15).optional() },
});

export type QaChatBody = z.infer<typeof qaChatBodySchema>;
