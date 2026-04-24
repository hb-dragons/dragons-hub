import { createMiddleware } from "hono/factory";
import { logger } from "../config/logger";
import { runWithLogContext, type LogContext } from "../config/log-context";
import { anonymizeIp, scrubUrl } from "../config/log-privacy";
import type { AppEnv } from "../types";

const REDACTED_HEADERS = new Set(["authorization", "cookie", "set-cookie"]);

// https://cloud.google.com/trace/docs/setup#force-trace
// Format: "TRACE_ID/SPAN_ID;o=TRACE_TRUE"
const CLOUD_TRACE_RE = /^([a-f0-9]+)\/(\d+)(?:;o=([01]))?$/i;

// W3C trace context: "version-traceid-parentid-flags"
// https://www.w3.org/TR/trace-context/#traceparent-header-field-values
const TRACEPARENT_RE =
  /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

interface ParsedTrace {
  traceId?: string;
  spanId?: string;
  traceSampled?: boolean;
}

function parseTraceContext(headers: Headers): ParsedTrace {
  const gcp = headers.get("x-cloud-trace-context");
  if (gcp) {
    const m = CLOUD_TRACE_RE.exec(gcp);
    if (m) return { traceId: m[1], spanId: m[2], traceSampled: m[3] === "1" };
  }
  const w3c = headers.get("traceparent");
  if (w3c) {
    const m = TRACEPARENT_RE.exec(w3c);
    if (m) {
      const flags = parseInt(m[4] ?? "00", 16);
      return {
        traceId: m[2],
        spanId: m[3],
        traceSampled: (flags & 1) === 1,
      };
    }
  }
  return {};
}

export const requestLogger = createMiddleware<AppEnv>(async (c, next) => {
  const requestId = crypto.randomUUID();
  const trace = parseTraceContext(c.req.raw.headers);
  const ctx: LogContext = { requestId, ...trace };

  const childLogger = logger.child({ requestId });
  const start = performance.now();

  c.set("requestId", requestId);
  c.set("logger", childLogger);
  c.header("x-request-id", requestId);

  const { method, path } = c.req;
  // requestUrl / debug url have query values scrubbed so we never persist
  // PII that the caller embedded in the URL (email, token, userId, ...).
  const sanitizedUrl = scrubUrl(c.req.url);

  await runWithLogContext(ctx, async () => {
    if (childLogger.level === "debug" || childLogger.level === "trace") {
      const headers: Record<string, string> = {};
      c.req.raw.headers.forEach((value, key) => {
        headers[key] = REDACTED_HEADERS.has(key) ? "[REDACTED]" : value;
      });
      childLogger.debug(
        { method, path, url: sanitizedUrl, headers },
        "→ incoming request",
      );
    }

    await next();

    const durationMs = performance.now() - start;
    const duration = Math.round(durationMs);
    const status = c.res.status;
    const userAgent = c.req.header("user-agent");
    const rawIp =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip");
    // IP is anonymized (last IPv4 octet / last 64 IPv6 bits zeroed) so the
    // logged value is no longer personal data under GDPR Art. 4(1).
    const remoteIp = anonymizeIp(rawIp);
    const responseSize = c.res.headers.get("content-length");

    // Cloud Logging renders this field as a proper HTTP row with status + latency.
    // https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#httprequest
    const httpRequest: Record<string, unknown> = {
      requestMethod: method,
      requestUrl: sanitizedUrl,
      status,
      latency: `${(durationMs / 1000).toFixed(3)}s`,
    };
    if (userAgent) httpRequest.userAgent = userAgent;
    if (remoteIp) httpRequest.remoteIp = remoteIp;
    if (responseSize) httpRequest.responseSize = responseSize;

    childLogger.info(
      { method, path, status, duration, httpRequest },
      `${method} ${path} → ${status} (${duration}ms)`,
    );

    if (childLogger.level === "debug" || childLogger.level === "trace") {
      childLogger.debug(
        { status, duration, contentLength: responseSize },
        "← response sent",
      );
    }
  });
});
