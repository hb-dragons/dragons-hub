export type ChatToolStatus = "running" | "done" | "error";

export interface ChatToolChip {
  /** Bare tool name, e.g. "get_standings". */
  toolKey: string;
  status: ChatToolStatus;
}

interface ToolLikePart {
  type: string;
  state?: string;
  toolName?: string;
}

const TOOL_PREFIX = "tool-";

/** Map an AI SDK v6 message part to a chip descriptor, or null if it is not a tool part. */
export function toolChip(part: ToolLikePart): ChatToolChip | null {
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
