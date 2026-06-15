import { streamText, stepCountIs, convertToModelMessages } from "ai";
import type { UIMessage } from "ai";
import { chatbotModel } from "../../config/ai";
import { toAiSdkTools } from "../tool-kit";
import { qaTools } from "./qa-tools";
import { buildClubQaSystemPrompt } from "./qa-system-prompt";

export async function streamClubQaChat(opts: {
  messages: UIMessage[];
  locale?: string;
}): Promise<Response> {
  const result = streamText({
    model: chatbotModel(),
    system: buildClubQaSystemPrompt({ locale: opts.locale }),
    messages: await convertToModelMessages(opts.messages),
    tools: toAiSdkTools(qaTools),
    stopWhen: stepCountIs(5),
  });
  return result.toUIMessageStreamResponse();
}
