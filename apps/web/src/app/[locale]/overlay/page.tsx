import { getServerApi } from "@/lib/api.server";
import type { BroadcastState } from "@dragons/shared";
import { OverlayClient } from "./overlay-client";

const deviceId = process.env.NEXT_PUBLIC_SCOREBOARD_DEVICE_ID ?? "";

export default async function OverlayPage() {
  let initial: BroadcastState | null = null;
  if (deviceId) {
    try {
      initial = await (await getServerApi()).broadcast.state(deviceId);
    } catch {
      initial = null;
    }
  }
  return <OverlayClient deviceId={deviceId} initial={initial} />;
}
