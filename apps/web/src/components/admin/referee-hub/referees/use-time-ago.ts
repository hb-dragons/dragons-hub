import { useEffect, useState } from "react";

/**
 * Returns seconds elapsed since `timestamp` (rounded down, min 1). Ticks every second
 * while `active` is true. Returns 0 when `timestamp` is null.
 */
export function useTimeAgo(timestamp: number | null, active = true): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active || timestamp == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active, timestamp]);

  if (timestamp == null) return 0;
  return Math.max(1, Math.floor((now - timestamp) / 1000));
}
