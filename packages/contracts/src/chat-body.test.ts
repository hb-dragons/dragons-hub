import { describe, expect, it } from "vitest";
import { z } from "zod";
import { chatBodySchema } from "./chat-body";
import { qaChatBodySchema } from "./qa";

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
 * The per-route part bound is the one thing the factory deliberately does not
 * share: each route derives its own ceiling from its step budget and tool list
 * (`apps/api/src/ai/chat-part-budget.test.ts`). A refactor that "tidied" the
 * bounds into a single shared constant would reintroduce exactly the bug the
 * factory exists to prevent, so pin the live route's number here.
 */
describe("per-route part bounds stay separate", () => {
  it("holds the Q&A chat to 30 parts per message", () => {
    expect(qaChatBodySchema.safeParse({ messages: [message(30)] }).success).toBe(true);
    expect(qaChatBodySchema.safeParse({ messages: [message(31)] }).success).toBe(false);
  });

  it("does not read its bound from the factory default", () => {
    // A route that passed no bound of its own would accept far more than 30.
    const unbounded = chatBodySchema({ maxPartsPerMessage: 200, extra: {} });
    expect(unbounded.safeParse({ messages: [message(31)] }).success).toBe(true);
    expect(qaChatBodySchema.safeParse({ messages: [message(31)] }).success).toBe(false);
  });
});
