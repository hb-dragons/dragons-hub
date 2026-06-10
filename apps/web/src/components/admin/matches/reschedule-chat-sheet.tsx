"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@dragons/ui/components/sheet";
import { Button } from "@dragons/ui/components/button";
import { Textarea } from "@dragons/ui/components/textarea";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function RescheduleChatSheet({
  matchId,
  open,
  onOpenChange,
}: {
  matchId: number;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useTranslations("matches.reschedule");
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: `${API_BASE}/admin/assistant/reschedule/chat`,
      credentials: "include",
      body: { matchId },
    }),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-4 bg-popover shadow-lg ring-1 ring-foreground/10 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription>{t("description")}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-2 overflow-y-auto">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className="rounded-md bg-surface-low px-3 py-2 text-sm"
            >
              {msg.parts.map((part, i) =>
                part.type === "text" ? <span key={i}>{part.text}</span> : null,
              )}
            </div>
          ))}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) {
              void sendMessage({ text: input });
              setInput("");
            }
          }}
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("placeholder")}
            className="rounded-md"
            rows={2}
          />
          <Button type="submit" disabled={status !== "ready"}>
            {t("send")}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
