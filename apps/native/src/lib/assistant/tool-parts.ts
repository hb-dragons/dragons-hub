import type { UiPart } from "./messages";

export type ChatToolStatus = "running" | "done" | "error";
export interface ChatToolChip {
  toolKey: string;
  status: ChatToolStatus;
}

const TOOL_PREFIX = "tool-";

export function toolChip(part: Pick<UiPart, "type" | "state" | "toolName">): ChatToolChip | null {
  let toolKey: string | null = null;
  if (part.type === "dynamic-tool") {
    toolKey = part.toolName ?? "";
  } else if (part.type.startsWith(TOOL_PREFIX)) {
    toolKey = part.type.slice(TOOL_PREFIX.length);
  }
  if (toolKey === null) return null;

  const status: ChatToolStatus =
    part.state === "output-error" ? "error" : part.state === "output-available" ? "done" : "running";
  return { toolKey, status };
}
