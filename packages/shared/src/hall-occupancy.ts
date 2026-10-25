import type { HallCoverageInfo } from "./hall-times";

/** One home game on a hall day. Times are HH:mm:ss. */
export interface HallOccupancyGame {
  matchId: number;
  kickoffTime: string;
  endTime: string;
  homeTeam: string;
  homeTeamCustomName: string | null;
  homeBadgeColor: string | null;
  guestTeam: string;
  leagueName: string | null;
}

/** One venue and day: the games played there against the day's hall time. */
export interface HallOccupancyDay extends HallCoverageInfo {
  venueId: number;
  venueName: string;
  /** YYYY-MM-DD */
  date: string;
  windowStart: string;
  windowEnd: string;
  games: HallOccupancyGame[];
}
