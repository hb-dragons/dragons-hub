import { ScoreboardDebug } from "./scoreboard-debug";

const deviceId = process.env.NEXT_PUBLIC_SCOREBOARD_DEVICE_ID ?? "";
console.log("deviceId", deviceId);
export default function AdminScoreboardPage() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Scoreboard ingest</h1>
      <ScoreboardDebug deviceId={deviceId} />
    </div>
  );
}
