import { StandingsScreen } from "@/components/StandingsScreen";

/**
 * The league tables as a pushed screen, reached from Home by Staff whose
 * Officiating tab replaced the Standings tab. Same content as the tab; a tab
 * route cannot serve them, because native tabs only mount the routes whose
 * triggers render. Its header — the same large title the tab shows, plus a
 * back button — is declared once in the root layout.
 */
export default function LeagueTablesScreen() {
  return <StandingsScreen />;
}
