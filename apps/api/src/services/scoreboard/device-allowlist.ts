import { env } from "../../config/env";

/**
 * The deployment is wired to exactly one scoreboard panel. `SCOREBOARD_DEVICE_ID`
 * is that id: ingest already rejects a Pi whose `Device_ID` header does not
 * match it, and the web build inlines the same value as
 * `NEXT_PUBLIC_SCOREBOARD_DEVICE_ID`. Everything that takes a `deviceId` off a
 * request checks it against this one configured value — no second source of
 * truth, and no request-supplied id reaching a write.
 */
export function isConfiguredDevice(deviceId: string): boolean {
  return deviceId === env.SCOREBOARD_DEVICE_ID;
}

export const UNKNOWN_DEVICE_BODY = {
  error: "Unknown device",
  code: "UNKNOWN_DEVICE",
} as const;
