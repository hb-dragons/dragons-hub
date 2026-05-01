import { fetchAPI } from "@/lib/api";
import type { BroadcastState } from "@dragons/shared";
import { OverlayClient } from "./overlay-client";

const deviceId = process.env.NEXT_PUBLIC_SCOREBOARD_DEVICE_ID ?? "";

export default async function OverlayPage() {
  let initial: BroadcastState | null = null;
  if (deviceId) {
    try {
      initial = await fetchAPI<BroadcastState>(
        `/public/broadcast/state?deviceId=${encodeURIComponent(deviceId)}`,
      );
    } catch {
      initial = null;
    }
  }
  return <OverlayClient deviceId={deviceId} initial={initial} />;
}
