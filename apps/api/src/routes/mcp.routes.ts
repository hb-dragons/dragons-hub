import { Hono } from "hono";
import { RESPONSE_ALREADY_SENT } from "@hono/node-server/utils/response";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AppEnv } from "../types";
import { env } from "../config/env";
import { buildMcpServer } from "../ai/mcp-server";

const mcpRoutes = new Hono<AppEnv>();

mcpRoutes.post("/mcp", async (c) => {
  const auth = c.req.header("authorization");
  if (!env.MCP_TOKEN || auth !== `Bearer ${env.MCP_TOKEN}`) {
    return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  }
  const body = await c.req.json().catch(() => undefined);
  const { incoming, outgoing } = c.env as unknown as {
    incoming: IncomingMessage;
    outgoing: ServerResponse;
  };

  const server = buildMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }); // stateless
  outgoing.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(incoming, outgoing, body);
  return RESPONSE_ALREADY_SENT;
});

export { mcpRoutes };
