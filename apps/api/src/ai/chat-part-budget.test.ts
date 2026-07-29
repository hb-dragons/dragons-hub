import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { assistantRescheduleChatBodySchema, qaChatBodySchema } from "@dragons/contracts";
import { RESCHEDULE_STEP_BUDGET } from "./chat";
import { reschedTools } from "./tool-registry";
import { QA_STEP_BUDGET } from "./qa/qa-chat";
import { qaTools } from "./qa/qa-tools";
import type { ChatTool } from "./tool-kit";

/**
 * Keeps every AI SDK chat route's per-message part bound honest.
 *
 * `@dragons/contracts` caps `parts` per `UIMessage`, once per route. Set a bound
 * below what its route can actually emit and the failure is unrecoverable from
 * the client: `useChat` keeps the oversized assistant message in state and
 * `DefaultChatTransport` re-sends the whole list on every later turn, so the
 * chat 400s on every send until the page reloads, and nothing in either chat UI
 * clears the transcript. That already happened once on the copilot, when the
 * bound was copied from the Q&A route.
 *
 * The contract package cannot import from the API, so the derivation is checked
 * here, from each route's live step budget and tool list, by building the widest
 * assistant message that route can produce and parsing it. Adding a tool or
 * raising a step budget therefore fails the build rather than dead-ending a chat
 * in production.
 */

/**
 * Non-`tool-*` parts a single step can add to the assistant message: the
 * `step-start` boundary, at most one merged `text` part, and at most one
 * `reasoning` part (Gemini thought summaries are off today; counting them keeps
 * the bounds valid if they are switched on).
 */
const NON_TOOL_PARTS_PER_STEP = 3;

interface ChatRoute {
  label: string;
  schema: z.ZodType;
  stepBudget: number;
  tools: ChatTool[];
  /** Fixed keys the route's body schema requires alongside `messages`. */
  body?: Record<string, unknown>;
}

const ROUTES: ChatRoute[] = [
  {
    label: "reschedule copilot",
    schema: assistantRescheduleChatBodySchema,
    stepBudget: RESCHEDULE_STEP_BUDGET,
    tools: reschedTools,
  },
  {
    label: "club Q&A",
    schema: qaChatBodySchema,
    stepBudget: QA_STEP_BUDGET,
    tools: qaTools,
  },
];

function widestAssistantMessage(route: ChatRoute) {
  const parts: Array<Record<string, unknown>> = [];
  for (let step = 0; step < route.stepBudget; step++) {
    parts.push({ type: "step-start" });
    // Worst case: the model calls every tool in parallel within one step.
    for (const tool of route.tools) {
      parts.push({
        type: `tool-${tool.name}`,
        toolCallId: `call-${step}-${tool.name}`,
        state: "output-available",
        input: {},
        output: {},
      });
    }
    parts.push({ type: "reasoning", text: "thinking" });
    parts.push({ type: "text", text: "Saturday 18:00 works." });
  }
  return { id: "assistant-1", role: "assistant", parts };
}

describe.each(ROUTES)("$label chat part budget", (route) => {
  it("the contract accepts the widest assistant message this route can emit", () => {
    const message = widestAssistantMessage(route);

    expect(message.parts).toHaveLength(
      route.stepBudget * (route.tools.length + NON_TOOL_PARTS_PER_STEP),
    );
    const result = route.schema.safeParse({ ...route.body, messages: [message] });
    expect(
      result.error?.issues,
      `${route.label}'s MAX_PARTS_PER_MESSAGE is below what its route can emit — ` +
        "re-derive it from the route's step budget and tool list",
    ).toBeUndefined();
  });

  it("still rejects one part beyond that derived ceiling", () => {
    const message = widestAssistantMessage(route);
    message.parts.push({ type: "text", text: "one too many" });

    expect(
      route.schema.safeParse({ ...route.body, messages: [message] }).success,
    ).toBe(false);
  });
});
