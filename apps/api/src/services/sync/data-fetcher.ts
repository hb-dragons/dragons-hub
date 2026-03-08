import { db } from "../../config/database";
import { leagues } from "@dragons/db/schema";
import { eq } from "drizzle-orm";
import pLimit from "p-limit";
import { sdkClient } from "./sdk-client";
import { logger } from "../../config/logger";

const log = logger.child({ service: "data-fetcher" });
import type {
  SdkSpielplanMatch,
  SdkTabelleEntry,
  SdkGetGameResponse,
  SdkTeamRef,
  SdkSpielfeld,
  SdkSpielleitung,
} from "@dragons/sdk";

export interface LeagueFetchedData {
  leagueApiId: number;
  leagueDbId: number | null;
  leagueName: string | null;
  spielplan: SdkSpielplanMatch[];
  tabelle: SdkTabelleEntry[];
  gameDetails: Map<number, SdkGetGameResponse>;
}

export interface CollectedSyncData {
  leagueData: LeagueFetchedData[];
  teams: Map<number, SdkTeamRef>;
  venues: Map<number, SdkSpielfeld>;
  referees: Map<number, ExtractedReferee>;
  refereeRoles: Map<number, ExtractedRefereeRole>;
}

export interface ExtractedReferee {
  schiedsrichterId: number;
  vorname: string;
  nachname: string;
  lizenznummer: number;
}

export interface ExtractedRefereeRole {
  schirirolleId: number;
  schirirollename: string;
  schirirollekurzname: string;
}

export interface ExtractedRefereeAssignment {
  matchApiId: number;
  schiedsrichterId: number;
  schirirolleId: number;
  slotNumber: number;
}

async function fetchLeagueData(
  leagueApiId: number,
  leagueDbId: number | null,
  leagueName: string | null,
): Promise<LeagueFetchedData> {
  log.info({ leagueApiId }, "Fetching data for league");

  const spielplan = await sdkClient.getSpielplan(leagueApiId);
  const matchIds = spielplan.map((m) => m.matchId).filter((id): id is number => !!id);

  const [tabelle, gameDetails] = await Promise.all([
    sdkClient.getTabelle(leagueApiId),
    matchIds.length > 0
      ? sdkClient.getGameDetailsBatch(matchIds)
      : Promise.resolve(new Map<number, SdkGetGameResponse>()),
  ]);

  log.info(
    { leagueApiId, matches: spielplan.length, standings: tabelle.length, details: gameDetails.size },
    "Fetched league data",
  );

  return { leagueApiId, leagueDbId, leagueName, spielplan, tabelle, gameDetails };
}

export async function fetchAllSyncData(): Promise<CollectedSyncData> {
  const trackedLeagues = await db
    .select({ id: leagues.id, apiLigaId: leagues.apiLigaId, name: leagues.name })
    .from(leagues)
    .where(eq(leagues.isTracked, true));

  if (trackedLeagues.length === 0) {
    log.warn("No tracked leagues found in database. Configure leagues first.");
    return {
      leagueData: [],
      teams: new Map(),
      venues: new Map(),
      referees: new Map(),
      refereeRoles: new Map(),
    };
  }

  log.info({ count: trackedLeagues.length }, "Fetching data for leagues in parallel");

  await sdkClient.ensureAuthenticated();

  const limit = pLimit(3);
  const leagueData = await Promise.all(
    trackedLeagues.map((l) => limit(() => fetchLeagueData(l.apiLigaId, l.id, l.name))),
  );

  const teams = collectUniqueTeams(leagueData);
  const venues = collectUniqueVenues(leagueData);
  const { referees, refereeRoles } = collectUniqueReferees(leagueData);

  log.info(
    { teams: teams.size, venues: venues.size, referees: referees.size, roles: refereeRoles.size },
    "Collected unique entities",
  );

  return { leagueData, teams, venues, referees, refereeRoles };
}

function collectUniqueTeams(allData: LeagueFetchedData[]): Map<number, SdkTeamRef> {
  const teams = new Map<number, SdkTeamRef>();
  for (const data of allData) {
    for (const match of data.spielplan) {
      if (match.homeTeam?.teamPermanentId) {
        teams.set(match.homeTeam.teamPermanentId, match.homeTeam);
      } else {
        log.warn({ leagueApiId: data.leagueApiId, matchId: match.matchId }, "Match has null/zero homeTeam (TBD slot)");
      }
      if (match.guestTeam?.teamPermanentId) {
        teams.set(match.guestTeam.teamPermanentId, match.guestTeam);
      } else {
        log.warn({ leagueApiId: data.leagueApiId, matchId: match.matchId }, "Match has null/zero guestTeam (TBD slot)");
      }
    }

    // Also collect teams from standings (tabelle) — catches teams missing from spielplan
    for (const entry of data.tabelle) {
      if (entry.team?.teamPermanentId) {
        teams.set(entry.team.teamPermanentId, entry.team);
      }
    }
  }
  return teams;
}

function collectUniqueVenues(allData: LeagueFetchedData[]): Map<number, SdkSpielfeld> {
  const venues = new Map<number, SdkSpielfeld>();
  for (const data of allData) {
    for (const [, details] of data.gameDetails) {
      const spielfeld = details.game1?.spielfeld;
      if (spielfeld?.id) {
        venues.set(spielfeld.id, spielfeld);
      }
      const heimSpielfeld = details.game1?.heimMannschaftLiga?.mannschaft?.spielfeld;
      if (heimSpielfeld?.id) {
        venues.set(heimSpielfeld.id, heimSpielfeld);
      }
      const gastSpielfeld = details.game1?.gastMannschaftLiga?.mannschaft?.spielfeld;
      if (gastSpielfeld?.id) {
        venues.set(gastSpielfeld.id, gastSpielfeld);
      }
    }
  }
  return venues;
}

function collectUniqueReferees(allData: LeagueFetchedData[]): {
  referees: Map<number, ExtractedReferee>;
  refereeRoles: Map<number, ExtractedRefereeRole>;
} {
  const referees = new Map<number, ExtractedReferee>();
  const refereeRoles = new Map<number, ExtractedRefereeRole>();

  for (const data of allData) {
    for (const [, details] of data.gameDetails) {
      for (const slotKey of ["sr1", "sr2", "sr3"] as const) {
        const slot = details[slotKey];
        const spielleitung = slot?.spielleitung;
        if (!spielleitung?.schiedsrichter?.personVO || !spielleitung?.schirirolle) {
          continue;
        }
        const { schiedsrichter, schirirolle } = spielleitung;
        referees.set(schiedsrichter.schiedsrichterId, {
          schiedsrichterId: schiedsrichter.schiedsrichterId,
          vorname: schiedsrichter.personVO.vorname,
          nachname: schiedsrichter.personVO.nachname,
          lizenznummer: schiedsrichter.lizenznummer,
        });
        refereeRoles.set(schirirolle.schirirolleId, {
          schirirolleId: schirirolle.schirirolleId,
          schirirollename: schirirolle.schirirollename,
          schirirollekurzname: schirirolle.schirirollekurzname,
        });
      }
    }
  }

  return { referees, refereeRoles };
}

export function extractRefereeAssignments(
  allData: LeagueFetchedData[],
): ExtractedRefereeAssignment[] {
  const assignments: ExtractedRefereeAssignment[] = [];
  for (const data of allData) {
    for (const [matchApiId, details] of data.gameDetails) {
      for (const [slotKey, slotNumber] of [["sr1", 1], ["sr2", 2], ["sr3", 3]] as const) {
        const slot = details[slotKey];
        const spielleitung = slot?.spielleitung;
        if (!spielleitung?.schiedsrichter || !spielleitung?.schirirolle) {
          continue;
        }
        assignments.push({
          matchApiId,
          schiedsrichterId: spielleitung.schiedsrichter.schiedsrichterId,
          schirirolleId: spielleitung.schirirolle.schirirolleId,
          slotNumber,
        });
      }
    }
  }
  return assignments;
}
