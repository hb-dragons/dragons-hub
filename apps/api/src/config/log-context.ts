import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

export interface LogContext {
  requestId?: string;
  traceId?: string;
  spanId?: string;
  traceSampled?: boolean;
}

const storage = new AsyncLocalStorage<LogContext>();

export function runWithLogContext<T>(ctx: LogContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getLogContext(): LogContext | undefined {
  return storage.getStore();
}

/**
 * Trace fields safe to serialize onto a BullMQ job so a worker can re-establish
 * the originating request's trace (jobs otherwise run with no trace context, so
 * a sync triggered by an API call is anonymous in the trace tree).
 */
export interface TraceCarrier {
  traceId?: string;
  spanId?: string;
  traceSampled?: boolean;
}

/** Snapshot the active trace for embedding in a job. Undefined when untraced. */
export function captureTrace(): TraceCarrier | undefined {
  const ctx = getLogContext();
  if (!ctx?.traceId) return undefined;
  return {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    traceSampled: ctx.traceSampled,
  };
}

/** Run `fn` with a trace restored from a carrier. No-op wrapper when absent. */
export function runWithTrace<T>(
  carrier: TraceCarrier | undefined,
  fn: () => T,
): T {
  if (!carrier?.traceId) return fn();
  return runWithLogContext(
    {
      traceId: carrier.traceId,
      spanId: carrier.spanId,
      traceSampled: carrier.traceSampled,
    },
    fn,
  );
}

function toW3CSpanId(spanId: string | undefined): string {
  if (spanId && /^[0-9a-f]{16}$/i.test(spanId)) return spanId.toLowerCase();
  // Cloud Trace span ids are decimal — render as zero-padded 16-hex.
  if (spanId && /^\d+$/.test(spanId)) {
    return BigInt(spanId).toString(16).padStart(16, "0").slice(-16);
  }
  // No usable parent span — mint a fresh one for this outbound call.
  return randomBytes(8).toString("hex");
}

/**
 * W3C `traceparent` for the active context, to propagate trace onto outbound
 * HTTP calls (e.g. the federation SDK). Returns undefined when there is no
 * trace, or a malformed (non-32-hex) trace id we shouldn't emit.
 */
export function currentTraceparent(): string | undefined {
  const ctx = getLogContext();
  if (!ctx?.traceId || !/^[0-9a-f]{32}$/i.test(ctx.traceId)) return undefined;
  const spanId = toW3CSpanId(ctx.spanId);
  const flags = ctx.traceSampled ? "01" : "00";
  return `00-${ctx.traceId.toLowerCase()}-${spanId}-${flags}`;
}
