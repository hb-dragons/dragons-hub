import { streamText, stepCountIs, convertToModelMessages } from "ai";
import type { UIMessage } from "ai";
import { assistantModel } from "../config/ai";
import { reschedTools } from "./tool-registry";
import { toAiSdkTools } from "./tool-kit";
import { buildRescheduleSystemPrompt } from "./system-prompt";
import { getMatchForReschedule } from "../services/reschedule/reschedule-context.service";

export async function streamRescheduleChat(messages: UIMessage[], matchId: number | undefined): Promise<Response> {
  const match = matchId != null ? await getMatchForReschedule(matchId) : null;
  const result = streamText({
    model: assistantModel(),
    system: buildRescheduleSystemPrompt(match),
    messages: await convertToModelMessages(messages),
    tools: toAiSdkTools(reschedTools),
    stopWhen: stepCountIs(8),
  });
  return result.toUIMessageStreamResponse();
}
