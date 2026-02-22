import type { SdkFetcher } from "./sdk-fetcher";

export interface EndpointDef {
  name: string;
  description: string;
  sampleFile: string;
  typeName: string;
  typeFile: string;
  requiresAuth: boolean;
  fetch: (fetcher: SdkFetcher, ids: DiscoveredIds) => Promise<unknown>;
}

export interface DiscoveredIds {
  competitionId: number;
  matchId: number | null;
}

export const endpoints: EndpointDef[] = [
  {
    name: "getLigaList",
    description: "List of leagues (paginated)",
    sampleFile: "getLigaList.json",
    typeName: "SdkLigaListResponse",
    typeFile: "types/liga.ts",
    requiresAuth: false,
    fetch: (fetcher) => fetcher.fetchLigaList(),
  },
  {
    name: "getSpielplan",
    description: "Match schedule for a competition",
    sampleFile: "getSpielplan.json",
    typeName: "SdkSpielplanResponse",
    typeFile: "types/match.ts",
    requiresAuth: false,
    fetch: (fetcher, ids) => fetcher.fetchSpielplan(ids.competitionId),
  },
  {
    name: "getTabelle",
    description: "Standings table for a competition",
    sampleFile: "getTabelle.json",
    typeName: "SdkTabelleResponse",
    typeFile: "types/standings.ts",
    requiresAuth: false,
    fetch: (fetcher, ids) => fetcher.fetchTabelle(ids.competitionId),
  },
  {
    name: "getGameDetails",
    description: "Detailed game info with referees (authenticated)",
    sampleFile: "getGameDetails.json",
    typeName: "SdkGetGameResponse",
    typeFile: "types/game-details.ts",
    requiresAuth: true,
    fetch: async (fetcher, ids) => {
      if (ids.matchId === null) {
        throw new Error("No matchId discovered — cannot fetch game details");
      }
      return fetcher.fetchGameDetails(ids.matchId);
    },
  },
];
