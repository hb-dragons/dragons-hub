import { describe, expect, it, vi } from "vitest";
import { DefaultChatTransport } from "ai";
import { assistantRescheduleChatBodySchema } from "@dragons/contracts";

/**
 * Client/server drift guard for `POST /admin/assistant/reschedule/chat`.
 *
 * The web copilot (`reschedule-chat-sheet.tsx`) talks to this endpoint through
 * the AI SDK's `DefaultChatTransport`, configured with `body: { matchId }` —
 * there is no `@dragons/api-client` wrapper for it, so no `*.contract.test.ts`
 * covered it.
 *
 * That mattered: `sendMessages` appends `id`, `trigger` and (when regenerating)
 * `messageId` to whatever `body` the caller configured. A strict request schema
 * that omits those three keys turns every real chat message into a 400, while a
 * hand-built test body would never notice.
 *
 * This drives the real transport and parses the real outgoing body, so an
 * AI-SDK upgrade that changes the envelope fails here rather than in
 * production.
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
    api: "https://example.test/admin/assistant/reschedule/chat",
    credentials: "include",
    // Exactly what reschedule-chat-sheet.tsx configures.
    body: { matchId: 7 },
    fetch: fetchFn as unknown as typeof fetch,
  });

  await transport.sendMessages({
    chatId: options.chatId,
    messageId: options.messageId,
    messages: [
      {
        id: "m1",
        role: "user",
        parts: [{ type: "text", text: "Can we move this to Saturday?" }],
      },
    ],
    abortSignal: undefined,
    trigger: options.trigger,
  });

  return captured;
}

describe("POST /admin/assistant/reschedule/chat accepts what the AI SDK transport actually sends", () => {
  it("parses a normal submit-message body", async () => {
    const body = await bodySentBy({ chatId: "chat-1", trigger: "submit-message" });

    const parsed = assistantRescheduleChatBodySchema.safeParse(body);
    expect(
      parsed.error?.issues,
      `assistantRescheduleChatBodySchema rejected the transport body: ${JSON.stringify(body)}`,
    ).toBeUndefined();
  });

  it("parses a regenerate body, which also carries messageId", async () => {
    const body = await bodySentBy({
      chatId: "chat-1",
      trigger: "regenerate-message",
      messageId: "m1",
    });

    expect((body as Record<string, unknown>)["messageId"]).toBe("m1");
    const parsed = assistantRescheduleChatBodySchema.safeParse(body);
    expect(
      parsed.error?.issues,
      `assistantRescheduleChatBodySchema rejected the regenerate body: ${JSON.stringify(body)}`,
    ).toBeUndefined();
  });

  it("still carries the matchId the web copilot configures", async () => {
    const body = await bodySentBy({ chatId: "chat-1", trigger: "submit-message" });

    expect((body as Record<string, unknown>)["matchId"]).toBe(7);
  });

  it("does not silently widen: a key outside the envelope is still rejected", async () => {
    const body = (await bodySentBy({
      chatId: "chat-1",
      trigger: "submit-message",
    })) as Record<string, unknown>;

    expect(
      assistantRescheduleChatBodySchema.safeParse({ ...body, model: "gpt-4" }).success,
    ).toBe(false);
  });
});
