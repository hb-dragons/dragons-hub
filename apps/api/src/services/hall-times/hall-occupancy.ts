import { timeToMinutes, type HallTimeWindow } from "@dragons/shared";

export interface BufferConfig {
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  defaultGameDurationMinutes: number;
}

/** A game placed in a hall. Times are "HH:mm" or "HH:mm:ss". */
export interface PlacedGame {
  kickoffTime: string;
  /** null = use the config default */
  durationMinutes: number | null;
}

const LAST_MINUTE_OF_DAY = 23 * 60 + 59;

function minutesToTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(totalMinutes, LAST_MINUTE_OF_DAY));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
}

function roundUp15(minutes: number): number {
  return Math.ceil(minutes / 15) * 15;
}

function roundDown15(minutes: number): number {
  return Math.floor(minutes / 15) * 15;
}

function endMinutes(game: PlacedGame, config: BufferConfig): number {
  return (
    timeToMinutes(game.kickoffTime) +
    (game.durationMinutes ?? config.defaultGameDurationMinutes)
  );
}

/** Kickoff plus game duration, without buffers. */
export function gameEnd(game: PlacedGame, config: BufferConfig): string {
  return minutesToTime(endMinutes(game, config));
}

/** Hall window a set of games needs: earliest kickoff minus the before buffer to latest end plus the after buffer. */
export function programmeWindow(
  games: PlacedGame[],
  config: BufferConfig,
): { start: string; end: string } | null {
  if (games.length === 0) return null;

  const start = Math.min(...games.map((g) => timeToMinutes(g.kickoffTime))) -
    config.bufferBeforeMinutes;
  const end =
    Math.max(...games.map((g) => endMinutes(g, config))) + config.bufferAfterMinutes;

  return {
    start: minutesToTime(start),
    end: end > LAST_MINUTE_OF_DAY ? "23:59:59" : minutesToTime(end),
  };
}

/** Whether a new game fits the hall's open window next to existing games, and where to start it. */
export function findFit(input: {
  hallTime: HallTimeWindow | null;
  games: PlacedGame[];
  durationMinutes: number;
  config: BufferConfig;
}): { fits: boolean; suggestedKickoffTime: string | null } {
  const { hallTime, games, durationMinutes, config } = input;
  const noFit = { fits: false, suggestedKickoffTime: null };

  if (
    !hallTime ||
    hallTime.kind !== "open" ||
    hallTime.startTime === null ||
    hallTime.endTime === null
  ) {
    return noFit;
  }

  const hs = timeToMinutes(hallTime.startTime);
  const he = timeToMinutes(hallTime.endTime);
  const { bufferBeforeMinutes: before, bufferAfterMinutes: after } = config;

  const sorted = games
    .map((game) => ({
      kickoff: timeToMinutes(game.kickoffTime),
      end: endMinutes(game, config),
    }))
    .sort((a, b) => a.kickoff - b.kickoff);

  const candidates: number[] = [];
  if (sorted.length === 0) {
    candidates.push(roundUp15(hs + before));
  } else {
    candidates.push(roundUp15(Math.max(...sorted.map((s) => s.end)) + after));
    candidates.push(roundDown15(sorted[0]!.kickoff - after - durationMinutes));
    for (let i = 0; i < sorted.length - 1; i++) {
      candidates.push(roundUp15(sorted[i]!.end + after));
    }
  }

  const fitsAt = (k: number): boolean => {
    if (k < 0) return false;
    const prev = [...sorted].reverse().find((s) => s.kickoff <= k);
    const next = sorted.find((s) => s.kickoff > k);
    if (prev && prev.end + after > k) return false;
    if (next && k + durationMinutes + after > next.kickoff) return false;
    const slotStart = prev ? k : k - before;
    const slotEnd = next ? k + durationMinutes : k + durationMinutes + after;
    return slotStart >= hs && slotEnd <= he && k + durationMinutes <= LAST_MINUTE_OF_DAY;
  };

  const chosen = candidates.find(fitsAt);
  return chosen === undefined
    ? noFit
    : { fits: true, suggestedKickoffTime: minutesToTime(chosen) };
}
