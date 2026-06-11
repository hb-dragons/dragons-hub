import type { PublicLiveSnapshot } from "@dragons/shared";
import { getServerApi } from "@/lib/api.server";
import { ScoreboardLive } from "./scoreboard-live";

const deviceId = process.env.NEXT_PUBLIC_SCOREBOARD_DEVICE_ID ?? "";

export default async function LivePage() {
  let initial: PublicLiveSnapshot | null = null;
  if (deviceId) {
    try {
      initial = await (await getServerApi()).scoreboard.latest(deviceId);
    } catch {
      initial = null;
    }
  }
  return <ScoreboardLive deviceId={deviceId} initialSnapshot={initial} />;
}
