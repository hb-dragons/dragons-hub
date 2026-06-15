export interface UiPart {
  type: string;
  text?: string;
  state?: string;
  toolName?: string;
}
export interface UiMessageLike {
  id: string;
  role: string;
  parts: UiPart[];
}

export type MessageSegment =
  | { kind: "text"; text: string }
  | { kind: "tool"; part: UiPart };

export function messageText(message: UiMessageLike): string {
  return message.parts
    .filter((p): p is UiPart & { text: string } => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
}

/** Split a message into ordered segments, merging consecutive text parts. */
export function messageSegments(message: UiMessageLike): MessageSegment[] {
  const out: MessageSegment[] = [];
  for (const p of message.parts) {
    if (p.type === "text" && typeof p.text === "string") {
      const last = out[out.length - 1];
      if (last && last.kind === "text") last.text += p.text;
      else out.push({ kind: "text", text: p.text });
    } else if (p.type === "dynamic-tool" || p.type.startsWith("tool-")) {
      out.push({ kind: "tool", part: p });
    }
  }
  return out;
}
