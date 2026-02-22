import type { SdkSpielfeld, SdkMannschaftLiga } from "./common";

export interface SdkSchirirolle {
  schirirolleId: number;
  schirirollename: string;
  schirirollekurzname: string;
}

export interface SdkPersonVO {
  personId: number;
  nachname: string;
  vorname: string;
  email: string;
  geburtsdatum: number | null;
  geschlecht: string;
}

export interface SdkSchiedsrichter {
  schiedsrichterId: number;
  vereinVO: unknown | null;
  personVO: SdkPersonVO;
  srgebietId: number;
  schiristatusId: number;
  lizenznummer: number;
}

export interface SdkSpielleitung {
  spielleitungId: number;
  schirirolle: SdkSchirirolle;
  schiedsrichter: SdkSchiedsrichter;
  spielleitungstatusId: number;
  spielleitungstatus: string;
  tempeinteilung: boolean;
  zeitpunktansetzung: number | null;
  zeitpunktaufhebung: number | null;
  bemerkung: string | null;
  einteilungsart: number;
  emailbenachrichtigt: boolean;
  nichtAngetreten: boolean;
}

export interface SdkRefereeSlot {
  spielleitung: SdkSpielleitung | null;
  lizenzNr: number | null;
  offenAngeboten: boolean;
}

export interface SdkGameDetails {
  spielplanId: number;
  spielnr: number;
  spieltag: number;
  spieldatum: number; // Timestamp in milliseconds
  spielfeldId: number;

  // Final scores
  heimEndstand: number;
  gastEndstand: number;

  // Halftime scores
  heimHalbzeitstand: number;
  gastHalbzeitstand: number;

  // Period scores (-1 = not applicable)
  heimV1stand: number;
  gastV1stand: number;
  heimV2stand?: number;
  gastV2stand?: number;
  heimV3stand: number;
  gastV3stand: number;
  heimV4stand: number;
  gastV4stand: number;
  heimV5stand?: number;
  gastV5stand?: number;
  heimV6stand?: number;
  gastV6stand?: number;
  heimV7stand?: number;
  gastV7stand?: number;
  heimV8stand?: number;
  gastV8stand?: number;

  // Overtime scores (-1 = not applicable)
  heimOt1stand: number;
  gastOt1stand: number;
  heimOt2stand: number;
  gastOt2stand: number;

  // Venue data
  spielfeld: SdkSpielfeld | null;

  // Team data
  heimMannschaftLiga: SdkMannschaftLiga;
  gastMannschaftLiga: SdkMannschaftLiga;
}

export interface SdkGetGameResponse {
  game1: SdkGameDetails;
  sr1: SdkRefereeSlot;
  sr2: SdkRefereeSlot;
  sr3: SdkRefereeSlot;
}

export interface SdkOpenGamesSearchParams {
  srName: string | null;
  ligaKurz: string | null;
  spielStatus: "ALLE" | "OFFEN" | "BESETZT";
  vereinsDelegation: "STANDARD" | "AUSSCHLIESSLICH" | "EINSCHLIESSLICH";
  vereinsSpiele: "STANDARD" | "AUSSCHLIESSLICH" | "EINSCHLIESSLICH";
  datum: string;
  zeitraum: "all" | "w1" | "w3";
  sortBy: string;
  sortOrder: "asc" | "desc";
  ats: string | null;
  pageFrom: number;
  pageSize: number;
}

export interface SdkOpenGame {
  spielplanId: number;
  spielnummer: string;
  spieldatum: string;
  spielzeit: string;
  ligaKurz: string;
  heimMannschaft: string;
  gastMannschaft: string;
  spielfeld: string;
  sr1Name?: string;
  sr2Name?: string;
  status: string;
}

export interface SdkOpenGamesResponse {
  data: SdkOpenGame[];
  totalCount: number;
  hasMore: boolean;
}

export interface SdkUserContext {
  loginName: string;
  userId?: number;
  vereinId?: number;
  vereinsname?: string;
  roles?: string[];
}

export interface SdkUserContextResponse {
  data: SdkUserContext;
}
