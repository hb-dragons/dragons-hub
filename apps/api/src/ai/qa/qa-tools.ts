import { z } from "zod";
import { defineTool, type ChatTool } from "../tool-kit";
import { getHomeDashboard } from "../../services/public/home-dashboard.service";
import { getStandings } from "../../services/admin/standings-admin.service";
import { getOwnClubMatches } from "../../services/admin/match-query.service";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const listMatchesInput = z.object({
  dateFrom: dateString.optional(),
  dateTo: dateString.optional(),
  leagueId: z.number().int().positive().optional(),
  teamApiId: z.number().int().positive().optional(),
  hasScore: z.boolean().optional(),
  sort: z.enum(["asc", "desc"]).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const qaTools: ChatTool[] = [
  defineTool(
    "get_dashboard",
    "Club overview: the next game, the last few results, upcoming fixtures, and season win/loss totals. Call this for 'what's next', 'how are we doing', or 'how did the last games go'.",
    z.object({}),
    () => getHomeDashboard(),
  ),
  defineTool(
    "get_standings",
    "Current league tables for the club's tracked leagues, including each team's position. Call this for 'what place is <team> in' or 'show the table'.",
    z.object({}),
    () => getStandings(),
  ),
  defineTool(
    "list_matches",
    "List the club's games, optionally filtered by date range (YYYY-MM-DD), league, team (teamApiId from standings), whether they have a score, and sort order. Call this for fixtures on a specific weekend or a team's schedule/results.",
    listMatchesInput,
    async (i) => {
      const r = await getOwnClubMatches({
        limit: i.limit ?? 50,
        offset: 0,
        excludeInactive: true,
        dateFrom: i.dateFrom,
        dateTo: i.dateTo,
        leagueId: i.leagueId,
        teamApiId: i.teamApiId,
        hasScore: i.hasScore,
        sort: i.sort ?? "asc",
      });
      return r.items;
    },
  ),
];
