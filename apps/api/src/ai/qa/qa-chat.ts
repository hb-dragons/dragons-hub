import { streamText, stepCountIs, convertToModelMessages } from "ai";
import type { UIMessage } from "ai";
import { chatbotModel } from "../../config/ai";
import { toAiSdkTools } from "../tool-kit";
import { qaTools } from "./qa-tools";
import { buildClubQaSystemPrompt } from "./qa-system-prompt";

/**
 * Tool-calling steps one Q&A turn may take. Exported because
 * `chat-part-budget.test.ts` re-derives `qa.ts`'s per-message part bound from
 * it — raising this without raising that bound would dead-end the chat.
 */
export const QA_STEP_BUDGET = 5;

export async function streamClubQaChat(opts: {
  messages: UIMessage[];
  locale?: string;
}): Promise<Response> {
  const result = streamText({
    model: chatbotModel(),
    system: buildClubQaSystemPrompt({ locale: opts.locale }),
    messages: await convertToModelMessages(opts.messages),
    tools: toAiSdkTools(qaTools),
    stopWhen: stepCountIs(QA_STEP_BUDGET),
  });
  return result.toUIMessageStreamResponse();
}
