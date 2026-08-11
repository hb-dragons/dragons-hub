"use client";

import { useEffect, useId, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useLocale, useTranslations } from "next-intl";
import { AssistantMessage, type ChatMessage } from "./assistant-message";
import { AssistantComposer } from "./assistant-composer";
import { AssistantEmptyState } from "./assistant-empty-state";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface AssistantPanelProps {
  onClose: () => void;
}

export function AssistantPanel({ onClose }: AssistantPanelProps) {
  const t = useTranslations("qa");
  const locale = useLocale();
  const { messages, sendMessage, status, error, stop, regenerate, setMessages, clearError } = useChat({
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

  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Floating panels rendered outside a modal primitive don't get any of
  // this for free: no dialog semantics, no focus trap, no focus restore,
  // no Escape. Wire them up by hand.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const firstFocusable = dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (firstFocusable ?? dialog)?.focus();

    return () => {
      previouslyFocused?.focus();
    };
    // Run once on mount/unmount only — re-running on every render would
    // re-steal focus from the message list or the composer while typing.
    // (dialogRef is a ref, stable across renders, so this has no other deps.)
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;

    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
    if (focusable.length === 0) return;

    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const send = (text: string) => void sendMessage({ text });

  // Issue #148: a rejected message stays in `messages` and the transport
  // re-sends the whole list every turn, so one 400 dead-ends the chat. Dropping
  // the transcript is the escape hatch. `clearError()` is required alongside it
  // — AI SDK v6 parks `status` at "error" and leaves `error` set, so the banner
  // would otherwise outlive the messages that caused it.
  const startNewChat = () => {
    setMessages([]);
    clearError();
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="fixed bottom-[calc(5rem+var(--safe-area-bottom))] right-4 z-50 flex h-[min(36rem,calc(100dvh-7rem))] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-md bg-popover shadow-lg ring-1 ring-foreground/10 sm:bottom-6 sm:w-96"
    >
      <div className="flex items-center gap-2 px-4 py-3">
        <span id={titleId} className="font-display text-sm font-bold uppercase tracking-tight text-foreground">{t("title")}</span>
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

      {error ? (
        <div className="flex items-center justify-between gap-2 px-4 py-1">
          <p className="text-sm text-destructive">{t("error")}</p>
          <button
            type="button"
            onClick={startNewChat}
            className="shrink-0 text-sm text-muted-foreground underline hover:text-foreground"
          >
            {t("newChat")}
          </button>
        </div>
      ) : null}

      <div className="px-4 py-3">
        <AssistantComposer status={status} onSend={send} onStop={() => void stop()} />
      </div>
    </div>
  );
}
