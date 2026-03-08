export interface BookingMatchInput {
  kickoffTime: string; // "HH:mm:ss"
  teamGameDuration: number | null; // minutes, null = use default
}

export interface BookingConfig {
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  defaultGameDurationMinutes: number;
}

export interface TimeWindow {
  calculatedStartTime: string; // "HH:mm:ss"
  calculatedEndTime: string; // "HH:mm:ss"
}

const MAX_MINUTES_IN_DAY = 23 * 60 + 59;
const MAX_SECONDS_IN_DAY = MAX_MINUTES_IN_DAY * 60 + 59;

function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number) as [number, number];
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(totalMinutes, MAX_MINUTES_IN_DAY));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
}

function clampEndTime(totalMinutes: number): string {
  if (totalMinutes > MAX_MINUTES_IN_DAY) {
    return "23:59:59";
  }
  return minutesToTime(totalMinutes);
}

export function calculateTimeWindow(
  matches: BookingMatchInput[],
  config: BookingConfig,
): TimeWindow | null {
  if (matches.length === 0) {
    return null;
  }

  const kickoffMinutes = matches.map((m) => parseTimeToMinutes(m.kickoffTime));

  const earliestKickoff = Math.min(...kickoffMinutes);
  const startMinutes = earliestKickoff - config.bufferBeforeMinutes;

  const matchEndMinutes = matches.map((m, i) => {
    const duration =
      m.teamGameDuration !== null
        ? m.teamGameDuration
        : config.defaultGameDurationMinutes;
    return kickoffMinutes[i]! + duration;
  });

  const latestMatchEnd = Math.max(...matchEndMinutes);
  const endMinutes = latestMatchEnd + config.bufferAfterMinutes;

  return {
    calculatedStartTime: minutesToTime(startMinutes),
    calculatedEndTime: clampEndTime(endMinutes),
  };
}
