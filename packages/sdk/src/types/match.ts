import type { SdkLigaData } from "./liga";
import type { SdkMatchDayInfo, SdkTeamRef } from "./common";

export interface SdkSpielplanMatch {
  ligaData: SdkLigaData | null;
  matchId: number;
  matchDay: number;
  matchNo: number;
  kickoffDate: string; // "YYYY-MM-DD"
  kickoffTime: string; // "HH:mm"
  homeTeam: SdkTeamRef | null;
  guestTeam: SdkTeamRef | null;
  result: string | null; // e.g., "63:61"
  ergebnisbestaetigt: boolean;
  statisticType: number | null;
  verzicht: boolean;
  abgesagt: boolean;
  matchResult: unknown | null;
  matchInfo: unknown | null;
  matchBoxscore: unknown | null;
  playByPlay: unknown | null;
  hasPlayByPlay: boolean | null;
}

export interface SdkSpielplanResponse {
  prevSpieltag: SdkMatchDayInfo | null;
  selSpieltag: SdkMatchDayInfo | null;
  selSpielDatum: string | null;
  nextSpieltag: SdkMatchDayInfo | null;
  ligaData: SdkLigaData;
  spieltage: SdkMatchDayInfo[] | null;
  matches: SdkSpielplanMatch[];
}
