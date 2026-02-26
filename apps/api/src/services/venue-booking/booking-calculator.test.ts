import { describe, expect, it } from "vitest";
import {
  calculateTimeWindow,
  type BookingConfig,
  type BookingMatchInput,
} from "./booking-calculator";

const defaultConfig: BookingConfig = {
  bufferBeforeMinutes: 30,
  bufferAfterMinutes: 15,
  defaultGameDurationMinutes: 90,
};

describe("calculateTimeWindow", () => {
  it("returns null for an empty matches array", () => {
    const result = calculateTimeWindow([], defaultConfig);

    expect(result).toBeNull();
  });

  it("calculates correct window for a single match with default duration", () => {
    const matches: BookingMatchInput[] = [
      { kickoffTime: "14:00:00", teamGameDuration: null },
    ];

    const result = calculateTimeWindow(matches, defaultConfig);

    expect(result).toEqual({
      calculatedStartTime: "13:30:00",
      calculatedEndTime: "15:45:00",
    });
  });

  it("uses team-specific duration when provided instead of default", () => {
    const matches: BookingMatchInput[] = [
      { kickoffTime: "14:00:00", teamGameDuration: 60 },
    ];

    const result = calculateTimeWindow(matches, defaultConfig);

    expect(result).toEqual({
      calculatedStartTime: "13:30:00",
      calculatedEndTime: "15:15:00",
    });
  });

  it("calculates correct window for multiple matches with mixed durations", () => {
    const matches: BookingMatchInput[] = [
      { kickoffTime: "10:00:00", teamGameDuration: null },
      { kickoffTime: "12:00:00", teamGameDuration: 120 },
      { kickoffTime: "14:00:00", teamGameDuration: 60 },
    ];

    const result = calculateTimeWindow(matches, defaultConfig);

    // start = MIN(10:00, 12:00, 14:00) - 30min = 09:30
    // match ends: 10:00+90=11:30, 12:00+120=14:00, 14:00+60=15:00
    // end = MAX(11:30, 14:00, 15:00) + 15min = 15:15
    expect(result).toEqual({
      calculatedStartTime: "09:30:00",
      calculatedEndTime: "15:15:00",
    });
  });

  it("handles all matches at the same kickoff time", () => {
    const matches: BookingMatchInput[] = [
      { kickoffTime: "16:00:00", teamGameDuration: null },
      { kickoffTime: "16:00:00", teamGameDuration: null },
    ];

    const result = calculateTimeWindow(matches, defaultConfig);

    expect(result).toEqual({
      calculatedStartTime: "15:30:00",
      calculatedEndTime: "17:45:00",
    });
  });

  it("picks the latest match end when durations differ at the same kickoff", () => {
    const matches: BookingMatchInput[] = [
      { kickoffTime: "16:00:00", teamGameDuration: 60 },
      { kickoffTime: "16:00:00", teamGameDuration: 120 },
    ];

    const result = calculateTimeWindow(matches, defaultConfig);

    // start = 16:00 - 30 = 15:30
    // match ends: 16:00+60=17:00, 16:00+120=18:00
    // end = MAX(17:00, 18:00) + 15 = 18:15
    expect(result).toEqual({
      calculatedStartTime: "15:30:00",
      calculatedEndTime: "18:15:00",
    });
  });

  it("does not produce negative times for early morning matches", () => {
    const matches: BookingMatchInput[] = [
      { kickoffTime: "00:15:00", teamGameDuration: null },
    ];

    const result = calculateTimeWindow(matches, defaultConfig);

    // start = 00:15 - 30 = clamp to 00:00:00
    expect(result).toEqual({
      calculatedStartTime: "00:00:00",
      calculatedEndTime: "02:00:00",
    });
  });

  it("clamps start time to 00:00:00 when buffer exceeds kickoff time", () => {
    const matches: BookingMatchInput[] = [
      { kickoffTime: "00:00:00", teamGameDuration: 60 },
    ];
    const config: BookingConfig = {
      bufferBeforeMinutes: 60,
      bufferAfterMinutes: 15,
      defaultGameDurationMinutes: 90,
    };

    const result = calculateTimeWindow(matches, config);

    expect(result).toEqual({
      calculatedStartTime: "00:00:00",
      calculatedEndTime: "01:15:00",
    });
  });

  it("handles zero buffers", () => {
    const matches: BookingMatchInput[] = [
      { kickoffTime: "10:00:00", teamGameDuration: null },
    ];
    const config: BookingConfig = {
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      defaultGameDurationMinutes: 90,
    };

    const result = calculateTimeWindow(matches, config);

    expect(result).toEqual({
      calculatedStartTime: "10:00:00",
      calculatedEndTime: "11:30:00",
    });
  });

  it("handles large buffers correctly", () => {
    const matches: BookingMatchInput[] = [
      { kickoffTime: "12:00:00", teamGameDuration: null },
    ];
    const config: BookingConfig = {
      bufferBeforeMinutes: 120,
      bufferAfterMinutes: 60,
      defaultGameDurationMinutes: 90,
    };

    const result = calculateTimeWindow(matches, config);

    expect(result).toEqual({
      calculatedStartTime: "10:00:00",
      calculatedEndTime: "14:30:00",
    });
  });

  it("pads single-digit hours and minutes with leading zeros", () => {
    const matches: BookingMatchInput[] = [
      { kickoffTime: "08:05:00", teamGameDuration: 50 },
    ];
    const config: BookingConfig = {
      bufferBeforeMinutes: 5,
      bufferAfterMinutes: 5,
      defaultGameDurationMinutes: 90,
    };

    const result = calculateTimeWindow(matches, config);

    expect(result).toEqual({
      calculatedStartTime: "08:00:00",
      calculatedEndTime: "09:00:00",
    });
  });

  it("handles end time crossing into the next hour correctly", () => {
    const matches: BookingMatchInput[] = [
      { kickoffTime: "09:30:00", teamGameDuration: 45 },
    ];
    const config: BookingConfig = {
      bufferBeforeMinutes: 15,
      bufferAfterMinutes: 20,
      defaultGameDurationMinutes: 90,
    };

    const result = calculateTimeWindow(matches, config);

    // start = 09:30 - 15 = 09:15
    // end = 09:30 + 45 + 20 = 10:35
    expect(result).toEqual({
      calculatedStartTime: "09:15:00",
      calculatedEndTime: "10:35:00",
    });
  });

  it("handles a late evening match", () => {
    const matches: BookingMatchInput[] = [
      { kickoffTime: "22:00:00", teamGameDuration: null },
    ];

    const result = calculateTimeWindow(matches, defaultConfig);

    expect(result).toEqual({
      calculatedStartTime: "21:30:00",
      calculatedEndTime: "23:45:00",
    });
  });

  it("caps end time at 23:59:59 when it would exceed midnight", () => {
    const matches: BookingMatchInput[] = [
      { kickoffTime: "23:00:00", teamGameDuration: null },
    ];

    const result = calculateTimeWindow(matches, defaultConfig);

    // end = 23:00 + 90 + 15 = 24:45 → capped at 23:59:59
    expect(result).toEqual({
      calculatedStartTime: "22:30:00",
      calculatedEndTime: "23:59:59",
    });
  });

  it("selects earliest kickoff across many matches for start time", () => {
    const matches: BookingMatchInput[] = [
      { kickoffTime: "15:00:00", teamGameDuration: 60 },
      { kickoffTime: "11:00:00", teamGameDuration: 60 },
      { kickoffTime: "13:00:00", teamGameDuration: 60 },
      { kickoffTime: "09:00:00", teamGameDuration: 60 },
    ];

    const result = calculateTimeWindow(matches, defaultConfig);

    // start = MIN(15,11,13,09) - 30 = 08:30
    // ends: 16:00, 12:00, 14:00, 10:00 → MAX = 16:00 + 15 = 16:15
    expect(result).toEqual({
      calculatedStartTime: "08:30:00",
      calculatedEndTime: "16:15:00",
    });
  });

  it("handles a single match with zero team game duration", () => {
    const matches: BookingMatchInput[] = [
      { kickoffTime: "10:00:00", teamGameDuration: 0 },
    ];

    const result = calculateTimeWindow(matches, defaultConfig);

    // start = 10:00 - 30 = 09:30
    // end = 10:00 + 0 + 15 = 10:15
    expect(result).toEqual({
      calculatedStartTime: "09:30:00",
      calculatedEndTime: "10:15:00",
    });
  });
});
