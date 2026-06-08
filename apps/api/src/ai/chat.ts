import { streamText, tool, stepCountIs, convertToModelMessages } from "ai";
import type { UIMessage } from "ai";
import { assistantModel } from "../config/ai";
import { reschedTools } from "./tool-registry";
import { buildRescheduleSystemPrompt } from "./system-prompt";
import { getMatchForReschedule } from "../services/reschedule/reschedule-context.service";

function toAiSdkTools() {
  return Object.fromEntries(
    reschedTools.map((t) => [
      t.name,
      tool({ description: t.description, inputSchema: t.inputSchema, execute: (args: unknown) => t.execute(args) }),
    ]),
  );
}

export async function streamRescheduleChat(messages: UIMessage[], matchId: number | undefined): Promise<Response> {
  const match = matchId != null ? await getMatchForReschedule(matchId) : null;
  const result = streamText({
    model: assistantModel(),
    system: buildRescheduleSystemPrompt(match),
    messages: await convertToModelMessages(messages),
    tools: toAiSdkTools(),
    stopWhen: stepCountIs(8),
  });
  return result.toUIMessageStreamResponse();
}
