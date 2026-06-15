export interface PickDisplayTextInput {
  /** Latest streamed text. */
  full: string;
  /** Currently displayed text. */
  shown: string;
  isStreaming: boolean;
  /** Milliseconds since the last flush. */
  elapsedMs: number;
  /** Throttle interval (default 100 ms). */
  intervalMs?: number;
}

const blockCount = (s: string): number => s.split("\n\n").length;

/**
 * Decide what text to display for a streaming assistant message. Throttles
 * re-parses to ~intervalMs, but flushes immediately when streaming ends or a
 * new paragraph/block boundary completes (keeps lists and tables coherent).
 */
export function pickDisplayText({ full, shown, isStreaming, elapsedMs, intervalMs = 100 }: PickDisplayTextInput): string {
  if (!isStreaming) return full;
  if (elapsedMs >= intervalMs) return full;
  if (blockCount(full) > blockCount(shown)) return full;
  return shown;
}
