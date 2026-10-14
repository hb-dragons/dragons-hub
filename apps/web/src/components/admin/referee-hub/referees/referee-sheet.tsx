"use client";

import useSWR from "swr";
import { useTranslations } from "next-intl";
import { queries } from "@/lib/swr-queries";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@dragons/ui/components/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@dragons/ui/components/tabs";
import { Badge } from "@dragons/ui/components/badge";
import { ErrorState } from "@/components/ui/error-state";
import { useRefereeHubUrl, type HubSubtab } from "../use-referee-hub-url";
import { ProfileSubtab } from "./profile-subtab";
import { RulesSubtab } from "./rules-subtab";
import { UpcomingSubtab } from "./upcoming-subtab";
import { HistorySubtab } from "./history-subtab";

interface Props {
  /** The referee to show; null keeps the sheet closed. */
  refereeId: number | null;
  onClose: () => void;
}

/**
 * One referee's configuration and games, in a sheet over the referee table so
 * the table keeps its full width. Wider than the game sheet: the rules tab
 * lays out a row per team.
 */
export function RefereeSheet({ refereeId, onClose }: Props) {
  return (
    <Sheet open={refereeId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {refereeId !== null && <SheetBody refereeId={refereeId} />}
      </SheetContent>
    </Sheet>
  );
}

function SheetBody({ refereeId }: { refereeId: number }) {
  const t = useTranslations("refereeHub.referees");
  const { state, update } = useRefereeHubUrl();
  const refereeQ = queries.referee(refereeId);
  const { data: ref, error, isLoading, mutate } = useSWR(refereeQ.key, refereeQ.fetcher);

  // A failed load is not "referee not found".
  if (error) {
    return (
      <>
        <SheetTitle className="sr-only">{t("notFound")}</SheetTitle>
        <ErrorState className="m-4" onRetry={() => { void mutate(); }} />
      </>
    );
  }
  if (isLoading && !ref) {
    return <SheetTitle className="p-6 text-sm font-normal text-muted-foreground">{t("loading")}</SheetTitle>;
  }
  if (!ref) {
    return <SheetTitle className="p-6 text-sm font-normal text-muted-foreground">{t("notFound")}</SheetTitle>;
  }

  return (
    <>
      <SheetHeader>
        <div className="flex items-start justify-between gap-3 pr-8">
          <SheetTitle className="font-display truncate text-xl font-bold">
            {ref.lastName}, {ref.firstName}
          </SheetTitle>
          {ref.isOwnClub && <Badge variant="secondary">{t("ownClubBadge")}</Badge>}
        </div>
        <SheetDescription>
          {t("licenseLabel", { number: ref.licenseNumber ?? "—" })} · {t("apiIdLabel", { id: ref.apiId })}
        </SheetDescription>
      </SheetHeader>
      <Tabs value={state.subtab} onValueChange={(v) => update({ subtab: v as HubSubtab })}>
        <TabsList className="mx-4">
          <TabsTrigger value="profile">{t("subtabs.profile")}</TabsTrigger>
          <TabsTrigger value="rules">{t("subtabs.rules")}</TabsTrigger>
          <TabsTrigger value="upcoming">{t("subtabs.upcoming")}</TabsTrigger>
          <TabsTrigger value="history">{t("subtabs.history")}</TabsTrigger>
        </TabsList>
        <TabsContent value="profile"><ProfileSubtab referee={ref} /></TabsContent>
        <TabsContent value="rules"><RulesSubtab referee={ref} /></TabsContent>
        <TabsContent value="upcoming"><UpcomingSubtab referee={ref} /></TabsContent>
        <TabsContent value="history"><HistorySubtab referee={ref} /></TabsContent>
      </Tabs>
    </>
  );
}
