import { describe, expect, it } from "vitest";
import { qaChatBodySchema } from "./qa";

const message = (text = "Wann spielt die U18?") => ({
  id: "1",
  role: "user" as const,
  parts: [{ type: "text", text }],
});

describe("qaChatBodySchema", () => {
  it("accepts a non-empty messages array and optional locale", () => {
    expect(qaChatBodySchema.safeParse({ messages: [message()], locale: "de" }).success).toBe(true);
    expect(qaChatBodySchema.safeParse({ messages: [message()] }).success).toBe(true);
  });

  it("tolerates extra fields the AI SDK adds to a message or part", () => {
    const result = qaChatBodySchema.safeParse({
      messages: [{ ...message(), metadata: { createdAt: 1 }, parts: [{ type: "text", text: "hi", state: "done" }] }],
    });
    expect(result.error?.issues ?? []).toEqual([]);
  });

  it("rejects a message without a recognised role", () => {
    expect(qaChatBodySchema.safeParse({ messages: [{ id: "1" }] }).success).toBe(false);
    expect(
      qaChatBodySchema.safeParse({ messages: [{ ...message(), role: "tool" }] }).success,
    ).toBe(false);
  });

  it("rejects an unbounded messages array", () => {
    const many = Array.from({ length: 61 }, () => message());
    expect(qaChatBodySchema.safeParse({ messages: many }).success).toBe(false);
  });

  it("rejects a single enormous text part", () => {
    expect(
      qaChatBodySchema.safeParse({ messages: [message("x".repeat(8001))] }).success,
    ).toBe(false);
  });

  it("rejects an unbounded parts array", () => {
    const parts = Array.from({ length: 21 }, () => ({ type: "text", text: "x" }));
    expect(qaChatBodySchema.safeParse({ messages: [{ ...message(), parts }] }).success).toBe(
      false,
    );
  });

  it("rejects a key the body schema does not declare", () => {
    expect(
      qaChatBodySchema.safeParse({ messages: [message()], model: "gpt-4" }).success,
    ).toBe(false);
  });

  // The AI SDK's DefaultChatTransport appends these to the caller's body. Both
  // the web widget and the native screen use it unmodified, so a strict schema
  // that omits them makes every chat request a 400.
  // `apps/api/src/routes/qa-chat-transport.contract.test.ts` drives the real
  // transport; these cases pin the fields at the unit level.
  it("accepts the AI SDK transport envelope", () => {
    const result = qaChatBodySchema.safeParse({
      messages: [message()],
      locale: "de",
      id: "chat-1",
      trigger: "submit-message",
      messageId: "m1",
    });
    expect(result.error?.issues ?? []).toEqual([]);
  });

  it("bounds the envelope fields", () => {
    expect(
      qaChatBodySchema.safeParse({ messages: [message()], id: "x".repeat(201) }).success,
    ).toBe(false);
    expect(
      qaChatBodySchema.safeParse({ messages: [message()], trigger: "x".repeat(51) }).success,
    ).toBe(false);
  });

  it("rejects an empty messages array", () => {
    expect(qaChatBodySchema.safeParse({ messages: [] }).success).toBe(false);
  });

  it("rejects a missing messages field", () => {
    expect(qaChatBodySchema.safeParse({ locale: "de" }).success).toBe(false);
  });
});
