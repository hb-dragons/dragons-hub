import type { SdkLigaData } from "./liga";
import type { SdkMatchDayInfo, SdkTeamRef } from "./common";
import type { SdkSpielplanMatch } from "./match";

export interface SdkTabelleEntry {
  rang: number;
  team: SdkTeamRef;
  anzspiele: number;
  anzGewinnpunkte: number;
  anzVerlustpunkte: number;
  s: number; // Siege (wins)
  n: number; // Niederlagen (losses)
  koerbe: number; // Points scored
  gegenKoerbe: number; // Points against
  korbdiff: number; // Point differential
}

export interface SdkTabelle {
  ligaData: SdkLigaData | null;
  entries: SdkTabelleEntry[];
}

export interface SdkTabelleResponse {
  prevSpieltag: SdkMatchDayInfo | null;
  selSpieltag: SdkMatchDayInfo | null;
  selSpielDatum: string | null;
  nextSpieltag: SdkMatchDayInfo | null;
  ligaData: SdkLigaData;
  spieltage: SdkMatchDayInfo[] | null;
  matches: SdkSpielplanMatch[];
  tabelle: SdkTabelle;
}
