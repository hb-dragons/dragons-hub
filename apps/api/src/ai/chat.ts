import { streamText, stepCountIs, convertToModelMessages } from "ai";
import type { UIMessage } from "ai";
import { assistantModel } from "../config/ai";
import { reschedTools } from "./tool-registry";
import { toAiSdkTools } from "./tool-kit";
import { buildRescheduleSystemPrompt } from "./system-prompt";
import { getMatchForReschedule } from "../services/reschedule/reschedule-context.service";

/**
 * How many tool-loop steps the copilot may take in one turn.
 *
 * Exported because it is half the derivation of `assistant.ts`'s
 * `MAX_PARTS_PER_MESSAGE` in `@dragons/contracts` — every step adds at least a
 * `step-start` part to the assistant `UIMessage`, and the client re-sends that
 * message on every later turn. `chat-part-budget.test.ts` re-derives the bound
 * from this and `reschedTools`, so raising it without raising the contract
 * fails the build.
 */
export const RESCHEDULE_STEP_BUDGET = 8;

export async function streamRescheduleChat(messages: UIMessage[], matchId: number | undefined): Promise<Response> {
  const match = matchId != null ? await getMatchForReschedule(matchId) : null;
  const result = streamText({
    model: assistantModel(),
    system: buildRescheduleSystemPrompt(match),
    messages: await convertToModelMessages(messages),
    tools: toAiSdkTools(reschedTools),
    stopWhen: stepCountIs(RESCHEDULE_STEP_BUDGET),
  });
  return result.toUIMessageStreamResponse();
}
