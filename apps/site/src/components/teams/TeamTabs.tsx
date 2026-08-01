/**
 * Spielplan/Tabelle tab block on the team detail page — the port of the
 * legacy `<UTabs variant="link" size="xl" :unmount-on-hide="false">` in
 * dragons-app `app/pages/teams/[slug].vue`. One island hosts both tabs so
 * the switch is a pure client-side toggle; both panels stay mounted
 * (`forceMount`, hidden via data-state) exactly like the legacy
 * unmount-on-hide=false, so switching never refetches.
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@dragons/ui/components/tabs";
import { strings } from "../../lib/strings";
import GamesIsland from "./GamesIsland";
import StandingsIsland from "./StandingsIsland";

const TRIGGER_CLASSES =
  "flex-none group relative inline-flex items-center min-w-0 font-medium rounded-md justify-center px-3 py-2 text-base gap-2 " +
  "text-muted-foreground hover:text-foreground data-[state=active]:text-primary dark:data-[state=active]:text-primary " +
  "data-[state=active]:bg-transparent dark:data-[state=active]:bg-transparent " +
  "after:bg-primary group-data-[orientation=horizontal]/tabs:after:bottom-0";

export default function TeamTabs({ teamApiId }: { teamApiId: number | null }) {
  return (
    <Tabs defaultValue="games" className="w-full items-center gap-2">
      <TabsList
        variant="line"
        className="relative flex h-auto w-full justify-start rounded-none border-b p-1 -mb-px"
      >
        <TabsTrigger value="games" className={TRIGGER_CLASSES}>
          {strings.teams.tabGames}
        </TabsTrigger>
        <TabsTrigger value="standings" className={TRIGGER_CLASSES}>
          {strings.teams.tabStandings}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="games" forceMount className="w-full text-base data-[state=inactive]:hidden">
        <GamesIsland teamApiId={teamApiId} />
      </TabsContent>
      <TabsContent
        value="standings"
        forceMount
        className="w-full text-base data-[state=inactive]:hidden"
      >
        <StandingsIsland teamApiId={teamApiId} />
      </TabsContent>
    </Tabs>
  );
}
