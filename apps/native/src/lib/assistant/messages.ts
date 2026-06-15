export interface UiTextPart {
  type: string;
  text?: string;
}
export interface UiMessageLike {
  id: string;
  role: string;
  parts: UiTextPart[];
}

export function messageText(message: UiMessageLike): string {
  return message.parts
    .filter((p): p is UiTextPart & { text: string } => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
}
