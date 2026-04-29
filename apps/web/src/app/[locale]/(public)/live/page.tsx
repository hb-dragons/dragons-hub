import { fetchAPI } from "@/lib/api";
import { ScoreboardLive } from "./scoreboard-live";

interface LiveSnapshot {
  deviceId: string;
  scoreHome: number;
  scoreGuest: number;
  foulsHome: number;
  foulsGuest: number;
  timeoutsHome: number;
  timeoutsGuest: number;
  period: number;
  clockText: string;
  clockSeconds: number | null;
  clockRunning: boolean;
  shotClock: number;
  timeoutActive: boolean;
  timeoutDuration: string;
  panelName: string | null;
  lastFrameAt: string;
  secondsSinceLastFrame: number;
}

const deviceId = process.env.NEXT_PUBLIC_SCOREBOARD_DEVICE_ID ?? "";

export default async function LivePage() {
  let initial: LiveSnapshot | null = null;
  if (deviceId) {
    try {
      initial = await fetchAPI<LiveSnapshot>(
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
