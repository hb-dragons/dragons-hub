import { z } from "zod";
import { tool as aiTool } from "ai";

export interface ChatTool {
  name: string;
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  execute: (input: unknown) => Promise<unknown>;
}

/** Define a tool whose raw input is parsed by `inputSchema` before `run` is called. */
export function defineTool<S extends z.ZodObject<z.ZodRawShape>>(
  name: string,
  description: string,
  inputSchema: S,
  run: (i: z.infer<S>) => Promise<unknown>,
): ChatTool {
  return {
    name,
    description,
    inputSchema,
    execute: async (raw) => run(inputSchema.parse(raw) as z.infer<S>),
  };
}

/** Convert a ChatTool[] into the AI SDK's `Record<string, Tool>` shape. */
export function toAiSdkTools(tools: ChatTool[]) {
  return Object.fromEntries(
    tools.map((t) => [
      t.name,
      aiTool({ description: t.description, inputSchema: t.inputSchema, execute: (args: unknown) => t.execute(args) }),
    ]),
  );
}
