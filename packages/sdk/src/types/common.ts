export interface SdkMatchDayInfo {
  spieltag: number;
  bezeichnung: string;
}

export interface SdkTeamRef {
  seasonTeamId: number;
  teamCompetitionId: number;
  teamPermanentId: number;
  teamname: string;
  teamnameSmall: string;
  clubId: number;
  verzicht: boolean;
}

export interface SdkSpielfeld {
  id: number;
  bezeichnung: string;
  strasse: string;
  plz: string;
  ort: string;
  kurzname: string;
  score: number;
}

export interface SdkVerein {
  vereinId: number;
  vereinsnummer: number;
  vereinsname: string;
  inaktiv: boolean;
  verbandId: number;
}

export interface SdkMannschaft {
  mannschaftId: number;
  name: string;
  kurzname: string;
  mannschaftsnr: number;
  verein: SdkVerein;
  spielfeld: SdkSpielfeld | null;
  spielhemdHeim: string | null;
  spielhoseHeim: string | null;
  spielhemdAuswaerts: string | null;
  spielhoseAuswaerts: string | null;
}

export interface SdkMannschaftLiga {
  mannschaftLigaId: number;
  mannschaft: SdkMannschaft;
  mannschaftName: string;
  mannschaftKurzname: string;
  verzicht: boolean;
  ausserKonkurrenz: boolean;
  schluesselnr: number;
  spielhemdHeim: string | null;
  spielhoseHeim: string | null;
  spielhemdAuswaerts: string | null;
  spielhoseAuswaerts: string | null;
}
