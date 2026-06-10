import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import { env } from "./env";

let _provider: ReturnType<typeof createGoogleGenerativeAI> | undefined;

function provider() {
  if (!_provider) {
    if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
    }
    _provider = createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY });
  }
  return _provider;
}

export function assistantModel(): LanguageModel {
  return provider()(env.ASSISTANT_MODEL);
}
