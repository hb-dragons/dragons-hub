import { describe, expect, it } from "vitest";
import { assistantRescheduleChatBodySchema } from "@dragons/contracts";
import { RESCHEDULE_STEP_BUDGET } from "./chat";
import { reschedTools } from "./tool-registry";

/**
 * Keeps the reschedule copilot's per-message part bound honest.
 *
 * `assistant.ts` in `@dragons/contracts` caps `parts` per `UIMessage`. Set it
 * below what the route can actually emit and the failure is unrecoverable from
 * the client: `useChat` keeps the oversized assistant message in state and
 * `DefaultChatTransport` re-sends the whole list on every later turn, so the
 * chat 400s on every send until the page reloads, and nothing in the web copilot
 * clears the transcript. That already happened once, when the bound was copied
 * from the Q&A route.
 *
 * The contract package cannot import from the API, so the derivation is checked
 * here, from the live step budget and tool list, by building the widest
 * assistant message the route can produce and parsing it.
 *
 * The Q&A route is not checked this way on purpose: its bound (20) is
 * deliberately tighter than its own theoretical worst case (5 steps x
 * (1 step-start + 3 tools + text + reasoning) = 30), on the grounds that a
 * three-tool chat does not fan out that far in practice.
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
  for (let step = 0; step < RESCHEDULE_STEP_BUDGET; step++) {
    parts.push({ type: "step-start" });
    // Worst case: the model calls every tool in parallel within one step.
    for (const tool of reschedTools) {
      parts.push({
        type: `tool-${tool.name}`,
        toolCallId: `call-${step}-${tool.name}`,
        state: "output-available",
        input: {},
        output: {},
      });
    }
    parts.push({ type: "reasoning", text: "considering slots" });
    parts.push({ type: "text", text: "Saturday 18:00 works." });
  }
  return { id: "assistant-1", role: "assistant", parts };
}

describe("reschedule chat part budget", () => {
  it("the contract accepts the widest assistant message this route can emit", () => {
    const message = widestAssistantMessage();

    expect(message.parts).toHaveLength(
      RESCHEDULE_STEP_BUDGET * (reschedTools.length + NON_TOOL_PARTS_PER_STEP),
    );
    const result = assistantRescheduleChatBodySchema.safeParse({ messages: [message] });
    expect(
      result.error?.issues,
      "assistantRescheduleChatBodySchema's MAX_PARTS_PER_MESSAGE is below what " +
        "chat.ts can emit — re-derive it from RESCHEDULE_STEP_BUDGET and reschedTools",
    ).toBeUndefined();
  });

  it("still rejects one part beyond that derived ceiling", () => {
    const message = widestAssistantMessage();
    message.parts.push({ type: "text", text: "one too many" });

    expect(assistantRescheduleChatBodySchema.safeParse({ messages: [message] }).success).toBe(
      false,
    );
  });
});
