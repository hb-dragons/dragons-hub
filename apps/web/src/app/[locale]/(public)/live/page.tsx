import type { PublicLiveSnapshot } from "@dragons/shared";
import { fetchAPI } from "@/lib/api";
import { ScoreboardLive } from "./scoreboard-live";

const deviceId = process.env.NEXT_PUBLIC_SCOREBOARD_DEVICE_ID ?? "";

export default async function LivePage() {
  let initial: PublicLiveSnapshot | null = null;
  if (deviceId) {
    try {
      initial = await fetchAPI<PublicLiveSnapshot>(
        `/public/scoreboard/latest?deviceId=${encodeURIComponent(deviceId)}`,
      );
    } catch {
      initial = null;
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-black text-white">
      <ScoreboardLive deviceId={deviceId} initialSnapshot={initial} />
    </main>
  );
}
