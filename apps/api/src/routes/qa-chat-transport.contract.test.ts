import { describe, expect, it, vi } from "vitest";
import { DefaultChatTransport } from "ai";
import { qaChatBodySchema } from "@dragons/contracts";

/**
 * Client/server drift guard for `POST /qa/chat`.
 *
 * `/qa/chat` is the one endpoint with no `@dragons/api-client` wrapper — the web
 * widget (`club-assistant/assistant-panel.tsx`) and the native screen
 * (`app/assistant.tsx`) both talk to it through the AI SDK's
 * `DefaultChatTransport`, so no `*.contract.test.ts` covered it.
 *
 * That mattered: `sendMessages` appends `id`, `trigger` and (when regenerating)
 * `messageId` to whatever `body` the caller configured. When the request schema
 * became strict, those three undeclared keys turned every chat message into a
 * 400 — in both apps — and nothing in the suite noticed.
 *
 * This drives the real transport and parses the real outgoing body, so an
 * AI-SDK upgrade that changes the envelope fails here rather than in production.
 */

/** Captures the body `DefaultChatTransport` actually puts on the wire. */
async function bodySentBy(options: {
  chatId: string;
  trigger: "submit-message" | "regenerate-message";
  messageId?: string;
}): Promise<unknown> {
  let captured: unknown;
  const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    captured = JSON.parse(init!.body as string);
    // The transport only needs a readable SSE stream to resolve.
    return new Response(new ReadableStream({ start: (c) => c.close() }), {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  });

  const transport = new DefaultChatTransport({
    api: "https://example.test/qa/chat",
    credentials: "include",
    // Exactly what both clients configure.
    body: { locale: "de" },
    fetch: fetchFn as unknown as typeof fetch,
  });

  await transport.sendMessages({
    chatId: options.chatId,
    messageId: options.messageId,
    messages: [
      {
        id: "m1",
        role: "user",
        parts: [{ type: "text", text: "Wann spielt die U18?" }],
      },
    ],
    abortSignal: undefined,
    trigger: options.trigger,
  });

  return captured;
}

describe("POST /qa/chat accepts what the AI SDK transport actually sends", () => {
  it("parses a normal submit-message body", async () => {
    const body = await bodySentBy({ chatId: "chat-1", trigger: "submit-message" });

    const parsed = qaChatBodySchema.safeParse(body);
    expect(
      parsed.error?.issues,
      `qaChatBodySchema rejected the transport body: ${JSON.stringify(body)}`,
    ).toBeUndefined();
  });

  it("parses a regenerate body, which also carries messageId", async () => {
    const body = await bodySentBy({
      chatId: "chat-1",
      trigger: "regenerate-message",
      messageId: "m1",
    });

    expect((body as Record<string, unknown>)["messageId"]).toBe("m1");
    const parsed = qaChatBodySchema.safeParse(body);
    expect(
      parsed.error?.issues,
      `qaChatBodySchema rejected the regenerate body: ${JSON.stringify(body)}`,
    ).toBeUndefined();
  });

  it("still carries the locale the clients configure", async () => {
    const body = await bodySentBy({ chatId: "chat-1", trigger: "submit-message" });

    expect((body as Record<string, unknown>)["locale"]).toBe("de");
  });

  it("does not silently widen: a key outside the envelope is still rejected", async () => {
    const body = (await bodySentBy({
      chatId: "chat-1",
      trigger: "submit-message",
    })) as Record<string, unknown>;

    expect(qaChatBodySchema.safeParse({ ...body, model: "gpt-4" }).success).toBe(false);
  });
});
