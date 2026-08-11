import { StandingsScreen } from "@/components/StandingsScreen";

/**
 * The league tables as a pushed screen, reached from Home by Staff whose
 * Officiating tab replaced the Standings tab. Same content as the tab; a tab
 * route cannot serve them, because native tabs only mount the routes whose
 * triggers render. Sits under the root stack's transparent detail header, so
 * the content clears it the same way team/game detail does.
 */
export default function LeagueTablesScreen() {
  return <StandingsScreen headerOffset={44} />;
}
