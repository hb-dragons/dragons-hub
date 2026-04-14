import type { SdkSpielfeld, SdkMannschaftLiga, SdkVerein } from "./common";

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
  ats: null;
  datum: string;
  ligaKurz: string | null;
  pageFrom: number;
  pageSize: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
  spielStatus: "ALLE" | "OFFEN" | "BESETZT";
  srName: string | null;
  vereinsDelegation: "ALLE";
  vereinsSpiele: "VEREIN" | "STANDARD" | "ALLE" | "NUR_HM" | "NUR_AM";
  zeitraum: "all" | "heute" | "woche" | "monat";
}

export interface SdkOffeneSpieleLiga {
  ligaId: number;
  liganr: number;
  liganame: string;
  ligaKurzname: string | null;
  srKurzname: string | null;
  sr1modus: string | null;
  sr2modus: string | null;
}

export interface SdkOffeneSpieleSp {
  spielplanId: number;
  spielnr: number;
  spieltag: number;
  spieldatum: number;
  spielfeldId: number | null;
  liga: SdkOffeneSpieleLiga;
  heimMannschaftLiga: SdkMannschaftLiga;
  gastMannschaftLiga: SdkMannschaftLiga;
  spielfeld: SdkSpielfeld | null;
  sr1Verein: SdkVerein | null;
  sr2Verein: SdkVerein | null;
  sr1VereinInformiert: boolean | null;
  sr2VereinInformiert: boolean | null;
  ergebnisbestaetigt: boolean;
  verzicht: boolean;
  abgesagt: boolean;
  spielortGeandert: boolean;
  spielzeitGeandert: boolean;
}

export interface SdkOffeneSpielResult {
  sp: SdkOffeneSpieleSp;
  sr1: SdkSpielleitung | null;
  sr2: SdkSpielleitung | null;
  sr1MeinVerein: boolean;
  sr2MeinVerein: boolean;
  sr1OffenAngeboten: boolean;
  sr2OffenAngeboten: boolean;
}

export interface SdkOffeneSpieleResponse {
  total: number;
  results: SdkOffeneSpielResult[];
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
