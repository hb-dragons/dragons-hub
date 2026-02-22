import type { SdkMatchDayInfo } from "./common";

export interface SdkLiga {
  ligaId: number;
  liganr: number;
  liganame: string;
  seasonId: number | null;
  seasonName: string | null;
  actualMatchDay: number | null;
  skName: string;
  skNameSmall: string;
  skEbeneId: number;
  skEbeneName: string;
  akName: string;
  geschlechtId: number;
  geschlecht: string;
  verbandId: number;
  verbandName: string;
  bezirknr: string | null;
  bezirkName: string | null;
  kreisnr: string | null;
  kreisname: string | null;
  statisticType: number | null;
  vorabliga: boolean;
  tableExists: boolean | null;
  crossTableExists: boolean | null;
}

export interface SdkLigaListResponse {
  startAtIndex: number;
  ligen: SdkLiga[];
  hasMoreData: boolean;
  size: number;
}

export interface SdkLigaData {
  seasonId: number;
  seasonName: string;
  actualMatchDay: SdkMatchDayInfo | null;
  ligaId: number;
  liganame: string;
  liganr: number;
  skName: string;
  skNameSmall: string;
  skEbeneId: number;
  skEbeneName: string;
  akName: string;
  geschlechtId: number;
  geschlecht: string;
  verbandId: number;
  verbandName: string;
  bezirknr: string | null;
  bezirkName: string | null;
  kreisnr: string | null;
  kreisname: string | null;
  statisticType: number | null;
  vorabliga: boolean;
  tableExists: boolean;
  crossTableExists: boolean;
}
