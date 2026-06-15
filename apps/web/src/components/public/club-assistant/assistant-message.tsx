"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AssistantMarkdown } from "./assistant-markdown";
import { ChatActivityChip } from "./chat-activity-chip";

interface MessagePart {
  type: string;
  text?: string;
  state?: string;
  toolName?: string;
}
export interface ChatMessage {
  id: string;
  role: string;
  parts: MessagePart[];
}

interface AssistantMessageProps {
  message: ChatMessage;
  /** True while this is the last message and still streaming. */
  isStreaming?: boolean;
  onRegenerate: () => void;
}

/** Join the text from this message's parts (markdown source). */
function messageText(parts: MessagePart[]): string {
  return parts
    .filter((p): p is MessagePart & { text: string } => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
}

export function AssistantMessage({ message, isStreaming, onRegenerate }: AssistantMessageProps) {
  const t = useTranslations("qa");
  const [copied, setCopied] = useState(false);
  const text = messageText(message.parts);

  if (message.role === "user") {
    return (
      <div className="ml-auto max-w-[80%] rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
        {text}
      </div>
    );
  }

  const toolParts = message.parts.filter((p) => p.type === "dynamic-tool" || p.type.startsWith("tool-"));
  const copy = () => {
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="border-l-2 border-primary pl-3">
      {toolParts.map((part, i) => (
        <ChatActivityChip key={i} part={part} />
      ))}
      <AssistantMarkdown text={text} isStreaming={isStreaming} />
      {!isStreaming && text.length > 0 ? (
        <div className="mt-2 flex gap-3 text-muted-foreground">
          <button type="button" onClick={copy} className="text-xs hover:text-foreground">
            {copied ? t("copied") : t("copy")}
          </button>
          <button type="button" onClick={onRegenerate} className="text-xs hover:text-foreground">
            {t("regenerate")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
