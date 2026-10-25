import { programmeWindow } from "../hall-times/hall-occupancy";

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

/** Temporary shim over programmeWindow; removed with the booking calculator. */
export function calculateTimeWindow(
  matches: BookingMatchInput[],
  config: BookingConfig,
): TimeWindow | null {
  const window = programmeWindow(
    matches.map((m) => ({
      kickoffTime: m.kickoffTime,
      durationMinutes: m.teamGameDuration,
    })),
    config,
  );
  return window
    ? { calculatedStartTime: window.start, calculatedEndTime: window.end }
    : null;
}
