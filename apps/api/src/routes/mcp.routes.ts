import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { RESPONSE_ALREADY_SENT } from "@hono/node-server/utils/response";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AppEnv } from "../types";
import { env } from "../config/env";
import { constantTimeEquals } from "../middleware/ingest-key";
import { rateLimit } from "../middleware/rate-limit";
import { buildMcpServer } from "../ai/mcp-server";

const mcpRoutes = new Hono<AppEnv>();

// Comfortably above a JSON-RPC tool call, far below anything worth buffering.
const MCP_MAX_BODY_BYTES = 256 * 1024;

// One bucket: callers are unauthenticated until the bearer check below, and the
// token holder is a single MCP host (Claude Desktop, Cursor). Sized for an
// agent loop's tool calls, not for fan-out.
const MCP_RATE_LIMIT = { limit: 120, windowSeconds: 60, keyPrefix: "mcp" };

mcpRoutes.post(
  "/mcp",
  // The endpoint serves the reschedule tool registry, so it lives and dies with
  // the same flag as the in-app copilot. Without this, a deployment that left
  // the assistant off still exposed every one of its tools over HTTP.
  async (c, next) => {
    if (!env.ASSISTANT_ENABLED) {
      return c.json(
        { error: "Assistant is disabled", code: "ASSISTANT_DISABLED" },
        503,
      );
    }
    return next();
  },
  bodyLimit({
    maxSize: MCP_MAX_BODY_BYTES,
    onError: (c) =>
      c.json({ error: "Body too large", code: "BODY_TOO_LARGE" }, 413),
  }),
  async (c, next) => {
    const auth = c.req.header("authorization") ?? "";
    // Compare in constant time so response latency does not reveal how much of
    // the token a guess got right.
    if (!env.MCP_TOKEN || !constantTimeEquals(auth, `Bearer ${env.MCP_TOKEN}`)) {
      return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    }
    return next();
  },
  rateLimit(MCP_RATE_LIMIT),
  async (c) => {
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
  },
);

export { mcpRoutes };
