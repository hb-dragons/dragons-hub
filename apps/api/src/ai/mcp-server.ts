import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { reschedTools } from "./tool-registry";

export function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "dragons-reschedule", version: "1.0.0" });
  for (const t of reschedTools) {
    server.registerTool(
      t.name,
      { description: t.description, inputSchema: t.inputSchema.shape },
      async (args: unknown) => {
        const result = await t.execute(args ?? {});
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
      },
    );
  }
  return server;
}
