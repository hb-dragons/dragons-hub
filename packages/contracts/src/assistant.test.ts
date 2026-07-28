import { describe, expect, it } from "vitest";
import { assistantRescheduleChatBodySchema } from "./assistant";

const message = (text = "Can we move this to Saturday?") => ({
  id: "1",
  role: "user" as const,
  parts: [{ type: "text", text }],
});

describe("assistantRescheduleChatBodySchema", () => {
  it("accepts a non-empty messages array and optional matchId", () => {
    expect(
      assistantRescheduleChatBodySchema.safeParse({ messages: [message()], matchId: 7 }).success,
    ).toBe(true);
    expect(assistantRescheduleChatBodySchema.safeParse({ messages: [message()] }).success).toBe(
      true,
    );
  });

  it("tolerates extra fields the AI SDK adds to a message or part", () => {
    const result = assistantRescheduleChatBodySchema.safeParse({
      messages: [{ ...message(), metadata: { createdAt: 1 }, parts: [{ type: "text", text: "hi", state: "done" }] }],
    });
    expect(result.error?.issues ?? []).toEqual([]);
  });

  it("rejects a message without a recognised role", () => {
    expect(assistantRescheduleChatBodySchema.safeParse({ messages: [{ id: "1" }] }).success).toBe(
      false,
    );
    expect(
      assistantRescheduleChatBodySchema.safeParse({ messages: [{ ...message(), role: "tool" }] })
        .success,
    ).toBe(false);
  });

  it("rejects more than 60 messages", () => {
    const messages = Array.from({ length: 61 }, () => ({ role: "user", parts: [] }));
    expect(assistantRescheduleChatBodySchema.safeParse({ messages }).success).toBe(false);
  });

  it("rejects a single enormous text part", () => {
    expect(
      assistantRescheduleChatBodySchema.safeParse({ messages: [message("x".repeat(8001))] })
        .success,
    ).toBe(false);
  });

  it("rejects an unbounded parts array", () => {
    const parts = Array.from({ length: 21 }, () => ({ type: "text", text: "x" }));
    expect(
      assistantRescheduleChatBodySchema.safeParse({ messages: [{ ...message(), parts }] })
        .success,
    ).toBe(false);
  });

  it("rejects a key the body schema does not declare", () => {
    expect(
      assistantRescheduleChatBodySchema.safeParse({ messages: [message()], model: "gpt-4" })
        .success,
    ).toBe(false);
  });

  it("rejects a non-positive or non-integer matchId", () => {
    expect(
      assistantRescheduleChatBodySchema.safeParse({ messages: [message()], matchId: 0 }).success,
    ).toBe(false);
    expect(
      assistantRescheduleChatBodySchema.safeParse({ messages: [message()], matchId: 1.5 })
        .success,
    ).toBe(false);
  });

  // The AI SDK's DefaultChatTransport appends these to the caller's body. The
  // web copilot uses it unmodified, so a strict schema that omits them makes
  // every chat request a 400.
  // `apps/api/src/routes/admin/assistant-chat-transport.contract.test.ts` drives
  // the real transport; these cases pin the fields at the unit level.
  it("accepts the AI SDK transport envelope", () => {
    const result = assistantRescheduleChatBodySchema.safeParse({
      messages: [message()],
      id: "chat-1",
      trigger: "submit-message",
    });
    expect(result.success).toBe(true);
  });

  it("accepts messageId, which only appears on regenerate()", () => {
    const result = assistantRescheduleChatBodySchema.safeParse({
      messages: [message()],
      id: "chat-1",
      trigger: "regenerate-message",
      messageId: "m1",
    });
    expect(result.error?.issues ?? []).toEqual([]);
  });

  it("bounds the envelope fields", () => {
    expect(
      assistantRescheduleChatBodySchema.safeParse({
        messages: [message()],
        id: "x".repeat(201),
      }).success,
    ).toBe(false);
    expect(
      assistantRescheduleChatBodySchema.safeParse({
        messages: [message()],
        trigger: "x".repeat(51),
      }).success,
    ).toBe(false);
  });

  it("rejects an empty messages array", () => {
    expect(assistantRescheduleChatBodySchema.safeParse({ messages: [] }).success).toBe(false);
  });

  it("rejects a missing messages field", () => {
    expect(assistantRescheduleChatBodySchema.safeParse({ matchId: 7 }).success).toBe(false);
  });
});
