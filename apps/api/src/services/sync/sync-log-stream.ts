import { createChannelFanout } from "../events/redis-channel-fanout";

// Shared subscriber for sync-run log channels. The SSE endpoint used to open a
// fresh `new Redis()` per connection; this fans every connection out from one
// subscriber instead. The publish side lives in sync-logger.ts.
const fanout = createChannelFanout("sync-logs");

export function syncLogChannel(syncRunId: number): string {
  return `sync:${syncRunId}:logs`;
}

export async function subscribeSyncLog(
  syncRunId: number,
  onMessage: (payload: unknown) => void,
): Promise<() => Promise<void>> {
  return fanout.subscribe(syncLogChannel(syncRunId), onMessage);
}
