import type { BroadcastPhase } from "@dragons/shared";

export interface PhaseInputs {
  isLive: boolean;
  matchId: number | null;
  period: number;
  clockRunning: boolean;
}

export function computePhase(input: PhaseInputs): BroadcastPhase {
  if (!input.isLive || input.matchId === null) return "idle";
  if (input.period === 0 && !input.clockRunning) return "pregame";
  return "live";
}
