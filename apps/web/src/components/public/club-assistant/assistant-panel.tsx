"use client";

import { useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useLocale, useTranslations } from "next-intl";
import { AssistantMessage, type ChatMessage } from "./assistant-message";
import { AssistantComposer } from "./assistant-composer";
import { AssistantEmptyState } from "./assistant-empty-state";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface AssistantPanelProps {
  onClose: () => void;
}

export function AssistantPanel({ onClose }: AssistantPanelProps) {
  const t = useTranslations("qa");
  const locale = useLocale();
  const { messages, sendMessage, status, error, stop, regenerate } = useChat({
    transport: new DefaultChatTransport({
      api: `${API_BASE}/qa/chat`,
      credentials: "include",
      body: { locale },
    }),
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = (text: string) => void sendMessage({ text });

  return (
    <div className="fixed bottom-[calc(5rem+var(--safe-area-bottom))] right-4 z-50 flex h-[min(36rem,calc(100dvh-7rem))] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-md bg-popover shadow-lg ring-1 ring-foreground/10 sm:bottom-6 sm:w-96">
      <div className="flex items-center gap-2 px-4 py-3">
        <span className="font-display text-sm font-bold uppercase tracking-tight text-foreground">{t("title")}</span>
        <button type="button" onClick={onClose} aria-label={t("close")} className="ml-auto text-muted-foreground hover:text-foreground">
          ✕
        </button>
      </div>

      <div ref={scrollRef} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
        {messages.length === 0 ? (
          <AssistantEmptyState onPick={send} />
        ) : (
          messages.map((m, i) => (
            <AssistantMessage
              key={m.id}
              message={m as unknown as ChatMessage}
              isStreaming={status === "streaming" && i === messages.length - 1 && m.role === "assistant"}
              onRegenerate={() => void regenerate()}
            />
          ))
        )}
        {status === "submitted" ? <p className="text-sm text-muted-foreground">…</p> : null}
      </div>

      {error ? <p className="px-4 py-1 text-sm text-destructive">{t("error")}</p> : null}

      <div className="px-4 py-3">
        <AssistantComposer status={status} onSend={send} onStop={() => void stop()} />
      </div>
    </div>
  );
}
