import { fetchAPI } from "@/lib/api";
import type { BroadcastConfig, BroadcastMatch } from "@dragons/shared";
import { BroadcastControl } from "./broadcast-control";

const deviceId = process.env.NEXT_PUBLIC_SCOREBOARD_DEVICE_ID ?? "";

interface ConfigResponse {
  config: BroadcastConfig | null;
  match: BroadcastMatch | null;
}

export default async function AdminBroadcastPage() {
  let initial: ConfigResponse = { config: null, match: null };
  if (deviceId) {
    try {
      initial = await fetchAPI<ConfigResponse>(
        `/admin/broadcast/config?deviceId=${encodeURIComponent(deviceId)}`,
      );
    } catch {
      initial = { config: null, match: null };
    }
  }
  return <BroadcastControl deviceId={deviceId} initial={initial} />;
}
