import { describe, expect, it } from "vitest";
import { z } from "zod";
import { chatBodySchema } from "./chat-body";
import { qaChatBodySchema } from "./qa";
import { assistantRescheduleChatBodySchema } from "./assistant";

const message = (partCount: number) => ({
  id: "1",
  role: "assistant" as const,
  parts: Array.from({ length: partCount }, () => ({ type: "text", text: "x" })),
});

describe("chatBodySchema", () => {
  it("bounds parts at exactly the number it was given", () => {
    const schema = chatBodySchema({ maxPartsPerMessage: 3, extra: {} });

    expect(schema.safeParse({ messages: [message(3)] }).success).toBe(true);
    expect(schema.safeParse({ messages: [message(4)] }).success).toBe(false);
  });

  it("declares the caller's extra fields", () => {
    const schema = chatBodySchema({
      maxPartsPerMessage: 3,
      extra: { tenant: z.string().min(1) },
    });

    expect(schema.safeParse({ messages: [message(1)], tenant: "dragons" }).success).toBe(true);
    expect(schema.safeParse({ messages: [message(1)] }).success).toBe(false);
    expect(schema.safeParse({ messages: [message(1)], other: "x" }).success).toBe(false);
  });

  it("does not let an extra field shadow messages or the transport envelope", () => {
    const schema = chatBodySchema({
      maxPartsPerMessage: 3,
      extra: { messages: z.string(), id: z.number() },
    });

    // `extra` is spread first, so the array and the string `id` still win.
    expect(schema.safeParse({ messages: "not an array" }).success).toBe(false);
    expect(schema.safeParse({ messages: [message(1)], id: "chat-1" }).success).toBe(true);
    expect(schema.safeParse({ messages: [message(1)], id: 7 }).success).toBe(false);
  });

  it("carries the shared message-count and text-size bounds", () => {
    const schema = chatBodySchema({ maxPartsPerMessage: 3, extra: {} });

    expect(schema.safeParse({ messages: [] }).success).toBe(false);
    expect(
      schema.safeParse({ messages: Array.from({ length: 61 }, () => message(1)) }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        messages: [{ id: "1", role: "user", parts: [{ type: "text", text: "x".repeat(8001) }] }],
      }).success,
    ).toBe(false);
  });
});

/**
 * The per-route bounds are the one thing the factory deliberately does not
 * share. A refactor that "tidied" them into a single constant would reintroduce
 * exactly the bug the factory exists to prevent, so pin both numbers and pin the
 * fact that they differ.
 */
describe("per-route part bounds stay separate", () => {
  it("holds the Q&A chat to 30 parts per message", () => {
    expect(qaChatBodySchema.safeParse({ messages: [message(30)] }).success).toBe(true);
    expect(qaChatBodySchema.safeParse({ messages: [message(31)] }).success).toBe(false);
  });

  it("gives the reschedule copilot 80 parts per message", () => {
    expect(
      assistantRescheduleChatBodySchema.safeParse({ messages: [message(80)] }).success,
    ).toBe(true);
    expect(
      assistantRescheduleChatBodySchema.safeParse({ messages: [message(81)] }).success,
    ).toBe(false);
  });

  it("does not apply one route's bound to the other", () => {
    // 31 parts: over the Q&A bound, comfortably inside the copilot's.
    expect(qaChatBodySchema.safeParse({ messages: [message(31)] }).success).toBe(false);
    expect(
      assistantRescheduleChatBodySchema.safeParse({ messages: [message(31)] }).success,
    ).toBe(true);
  });
});
