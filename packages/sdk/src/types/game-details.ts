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

  // ── Status flags ──────────────────────────────────────────────────────────
  // These are returned by getGameDetails and were previously absent from this
  // type, which forced matches.sync.ts to source them from the *spielplan*
  // response instead. `game-details-shape.test.ts` pins the full key set
  // against the recorded live sample.
  /** Result signed off by both teams. */
  ergebnisbestaetigt: boolean;
  /** Forfeit ("Verzicht"). */
  verzicht: boolean;
  /** Cancelled. */
  abgesagt: boolean;

  // ── Provenance / edit trail ───────────────────────────────────────────────
  /** Who entered the result, e.g. "SR" or a club short name. */
  ergebnisVon: string;
  dssUseraccountId: number | null;
  /** Venue changed after publication. */
  spielortGeandert: boolean;
  /** Kickoff time changed after publication. */
  spielzeitGeandert: boolean;

  // ── League ────────────────────────────────────────────────────────────────
  liga: SdkGameLiga | null;

  // ── Referee data ──────────────────────────────────────────────────────────
  /**
   * Assigned officials. The referee *assignment* endpoints return these
   * populated; the public game-details call sends `null`.
   */
  spielleitungList: SdkSpielleitung[] | null;
  /** Club delegated to provide SR1 / SR2 ("Vereinsdelegation"). */
  sr1Verein: SdkVerein | null;
  sr2Verein: SdkVerein | null;
  sr1VereinInformiert: boolean | null;
  sr2VereinInformiert: boolean | null;
  /**
   * "Ansetzungstool" state. Only ever observed as `null` or an opaque object;
   * nothing in this repo reads into it.
   */
  ats: unknown | null;
}

/**
 * The `liga` object embedded in a game-details response. Wider than
 * `SdkOffeneSpieleLiga` — it carries the full referee-assignment rule set.
 *
 * Fields are those recorded in `src/samples/getGameDetails.shape.json`. The
 * sub-objects the federation only ever sent as `null` in the recording
 * (`spielklasse`, `bezirk`, `kreis`, `verband`, …) are typed `unknown | null`
 * rather than guessed at, so nothing here claims more than was observed.
 */
export interface SdkGameLiga {
  ligaId: number;
  liganr: number;
  liganame: string;
  ligaKurzname: string | null;
  srKurzname: string | null;
  srKurznameOrLiganame: string;
  parentLigaId: number | null;
  geschlechtId: number;
  geschlecht: string;
  altersklasse: unknown | null;
  spielklasse: unknown | null;
  bezirk: unknown | null;
  kreis: unknown | null;
  verband: unknown | null;
  ausschreibung: string | null;
  spieltyp: string;
  vorabLiga: boolean;

  // Visibility
  notPublic: boolean;
  srNotPublic: boolean;
  srNotVisible: boolean;
  tabelleNotVisible: boolean;
  statistikNotVisible: boolean;

  // Scoring / statistics
  fibaLiveScores: boolean;
  fibaDss: boolean;
  fibaCompetitionName: string | null;
  scouting: boolean;
  ergViertel: boolean;
  spielerOhneTna: boolean;
  nationalitaetSpielerstats: boolean;
  localPlayerShowInfoEnabled: boolean;

  // Editability
  mannschaftdataEditable: boolean;
  spielplanEditable: boolean;
  mannschaftschluesselnrEditable: boolean;

  // Referee assignment rules
  srKosten: boolean;
  srKostenKmPauschal: number;
  srKoppelbar: boolean;
  srMindestabstandTage: number;
  srKmBegrenzungWochenende: number;
  srKmBegrenzung: number;
  sr1modus: string | null;
  sr2modus: string | null;
  sr3modus: string | null;
  srModusKom: boolean;
  srRueckgabefrist: number;
  srSpieleboerseAktiv: boolean;
  srSpieleDirektOnline: boolean;
  srOffeneSpieleSichtbarTage: number;
  srSofortUebernahmeErlaubt: boolean;
  srOeffentlAnbietenErlaubt: boolean;
  srZgSpieleAutoAnbieten: boolean;
  srEigeneAnsetzungAnbieten: boolean;
  srAnzahlSrHm: number;
  srAnzahlSrNichtHm: number;
  srGebiet: unknown | null;
  srQualifikation: unknown | null;
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
