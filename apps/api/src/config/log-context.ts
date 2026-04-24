import { AsyncLocalStorage } from "node:async_hooks";

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
