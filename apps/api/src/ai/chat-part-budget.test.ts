import { describe, expect, it } from "vitest";
import { qaChatBodySchema } from "@dragons/contracts";
import { QA_STEP_BUDGET } from "./qa/qa-chat";
import { qaTools } from "./qa/qa-tools";

/**
 * Keeps the club Q&A route's per-message part bound honest.
 *
 * `@dragons/contracts` caps `parts` per `UIMessage`, once per route. Set a bound
 * below what its route can actually emit and the failure is unrecoverable from
 * the client: `useChat` keeps the oversized assistant message in state and
 * `DefaultChatTransport` re-sends the whole list on every later turn, so the
 * chat 400s on every send until the page reloads, and nothing in the chat UI
 * clears the transcript. That already happened once, on the since-removed
 * rescheduling copilot, when its bound was copied from the Q&A route.
 *
 * The contract package cannot import from the API, so the derivation is checked
 * here, from the route's live step budget and tool list, by building the widest
 * assistant message it can produce and parsing it. Adding a tool or raising the
 * step budget therefore fails the build rather than dead-ending the chat in
 * production. A second chat route gets its own copy of this check, never a
 * shared bound — the copied bound is the bug.
 */

/**
 * Non-`tool-*` parts a single step can add to the assistant message: the
 * `step-start` boundary, at most one merged `text` part, and at most one
 * `reasoning` part (Gemini thought summaries are off today; counting them keeps
 * the bound valid if they are switched on).
 */
const NON_TOOL_PARTS_PER_STEP = 3;

function widestAssistantMessage() {
  const parts: Array<Record<string, unknown>> = [];
  for (let step = 0; step < QA_STEP_BUDGET; step++) {
    parts.push({ type: "step-start" });
    // Worst case: the model calls every tool in parallel within one step.
    for (const tool of qaTools) {
      parts.push({
        type: `tool-${tool.name}`,
        toolCallId: `call-${step}-${tool.name}`,
        state: "output-available",
        input: {},
        output: {},
      });
    }
    parts.push({ type: "reasoning", text: "thinking" });
    parts.push({ type: "text", text: "The next home game is on Saturday." });
  }
  return { id: "assistant-1", role: "assistant", parts };
}

describe("club Q&A chat part budget", () => {
  it("the contract accepts the widest assistant message this route can emit", () => {
    const message = widestAssistantMessage();

    expect(message.parts).toHaveLength(
      QA_STEP_BUDGET * (qaTools.length + NON_TOOL_PARTS_PER_STEP),
    );
    const result = qaChatBodySchema.safeParse({ messages: [message] });
    expect(
      result.error?.issues,
      "qa.ts's MAX_PARTS_PER_MESSAGE is below what /qa/chat can emit — " +
        "re-derive it from the route's step budget and tool list",
    ).toBeUndefined();
  });

  it("still rejects one part beyond that derived ceiling", () => {
    const message = widestAssistantMessage();
    message.parts.push({ type: "text", text: "one too many" });

    expect(qaChatBodySchema.safeParse({ messages: [message] }).success).toBe(false);
  });
});
