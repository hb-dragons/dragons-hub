"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@dragons/ui/components/button";
import { Textarea } from "@dragons/ui/components/textarea";

type ChatStatus = "submitted" | "streaming" | "ready" | "error";

interface AssistantComposerProps {
  status: ChatStatus;
  onSend: (text: string) => void;
  onStop: () => void;
}

export function AssistantComposer({ status, onSend, onStop }: AssistantComposerProps) {
  const t = useTranslations("qa");
  const [input, setInput] = useState("");
  const busy = status === "submitted" || status === "streaming";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setInput("");
  };

  return (
    <form className="flex items-end gap-2" onSubmit={submit}>
      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={t("placeholder")}
        className="max-h-32 min-h-[2.5rem] resize-none rounded-md"
        rows={1}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) submit(e);
        }}
      />
      {busy ? (
        <Button type="button" variant="outline" onClick={onStop}>
          {t("stop")}
        </Button>
      ) : (
        <Button type="submit">{t("send")}</Button>
      )}
    </form>
  );
}
