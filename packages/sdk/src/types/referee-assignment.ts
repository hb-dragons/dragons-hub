// Types for the Basketball-Bund federation referee assignment API (assignschiri)

export interface SdkRefCandidateMeta {
  schiedsrichterId: number;
  lizenzNr: number;
  heimTotal: number;
  gastTotal: number;
  total: number;
  va: number;
  eh: number;
  qmaxSr1: string | null;
  qmaxSr2: string | null;
  tnaCount: number;
  sperrvereinCount: number;
  sperrzeitenCount: number;
  qualiSr1: number;
  qualiSr2: number;
  qualiSr3: number;
  qualiCoa: number;
  qualiKom: number;
  entfernung: number;
  maxDatumBefore: number | null;
  minDatumAfter: number | null;
  anzAmTag: number;
  anzInWoche: number;
  anzImMonat: number;
}

export interface SdkRefCandidate {
  srId: number;
  vorname: string;
  nachName: string;
  email: string;
  lizenznr: number;
  strasse: string;
  plz: string;
  ort: string;
  distanceKm: string;
  qmaxSr1: string | null;
  qmaxSr2: string | null;
  warning: string[];
  meta: SdkRefCandidateMeta;
  qualiSr1: boolean;
  qualiSr2: boolean;
  qualiSr3: boolean;
  qualiCoa: boolean;
  qualiKom: boolean;
  srModusMismatchSr1: boolean;
  srModusMismatchSr2: boolean;
  ansetzungAmTag: boolean;
  blocktermin: boolean;
  zeitraumBlockiert: string | null;
  srGruppen: string[];
}

export interface SdkGetRefsPayload {
  spielId: number;
  textSearch: string | null;
  maxDistanz: number | null;
  qmaxIds: number[];
  mode: "EINSETZBAR" | "ALLE";
  globalerEinsatz: boolean;
  rollenIds: number[];
  gruppenIds: number[];
  sortBy: "distance" | "name";
  pageFrom: number;
  pageSize: number;
}

export interface SdkGetRefsResponse {
  total: number;
  results: SdkRefCandidate[];
}

export interface SdkAufheben {
  typ: "AUFHEBEN";
  grund: string | null;
}

export interface SdkSubmitSlotPayload {
  ansetzen: SdkRefCandidate | null;
  aufheben: SdkAufheben | null;
  ansetzenFix: boolean;
  ansetzenVerein: null; // Always null — club-sponsored assignment not used in protocol
  aufhebenVerein: null; // Always null — fixed protocol constant
  ansetzenFuerSpiel: 0; // Always 0 — fixed protocol token (not a game ID)
}

export type SdkSubmitPayload = {
  sr1: SdkSubmitSlotPayload;
  sr2: SdkSubmitSlotPayload;
  sr3: SdkSubmitSlotPayload;
  coa: SdkSubmitSlotPayload;
  kom: SdkSubmitSlotPayload;
};

export interface SdkSubmitResponse {
  game1: { spielplanId: number };
  gameInfoMessages: string[];
  editAnythingPossible: boolean;
}
