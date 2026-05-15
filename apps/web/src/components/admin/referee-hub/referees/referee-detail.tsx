"use client";

import useSWR from "swr";
import { useTranslations } from "next-intl";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { useRefereeHubUrl, type HubSubtab } from "../use-referee-hub-url";
import { ProfileSubtab } from "./profile-subtab";
import { UpcomingSubtab } from "./upcoming-subtab";
import { HistorySubtab } from "./history-subtab";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@dragons/ui/components/tabs";
import { Badge } from "@dragons/ui/components/badge";
import type { RefereeListItem, PaginatedResponse } from "@dragons/shared";

interface Props { refereeId: number }

export function RefereeDetail({ refereeId }: Props) {
  const t = useTranslations("refereeHub.referees");
  const { state, update } = useRefereeHubUrl();

  const { data } = useSWR<PaginatedResponse<RefereeListItem>>(SWR_KEYS.referees(true), apiFetcher);
  const ref = data?.items.find((r) => r.id === refereeId);

  if (!ref) return <div className="p-6 text-sm text-muted-foreground">{t("notFound")}</div>;

  return (
    <div>
      <div className="p-4 border-b flex justify-between items-start">
        <div>
          <h2 className="text-xl font-semibold">{ref.lastName}, {ref.firstName}</h2>
          <div className="text-xs text-muted-foreground">Lic {ref.licenseNumber ?? "—"} · API {ref.apiId} · {ref.roles.join(", ")}</div>
        </div>
        {ref.isOwnClub && <Badge variant="secondary">{t("ownClubBadge")}</Badge>}
      </div>
      <Tabs value={state.subtab} onValueChange={(v) => update({ subtab: v as HubSubtab })}>
        <TabsList className="m-4">
          <TabsTrigger value="profile">{t("subtabs.profile")}</TabsTrigger>
          <TabsTrigger value="upcoming">{t("subtabs.upcoming")}</TabsTrigger>
          <TabsTrigger value="history">{t("subtabs.history")}</TabsTrigger>
        </TabsList>
        <TabsContent value="profile"><ProfileSubtab referee={ref} /></TabsContent>
        <TabsContent value="upcoming"><UpcomingSubtab referee={ref} /></TabsContent>
        <TabsContent value="history"><HistorySubtab referee={ref} /></TabsContent>
      </Tabs>
    </div>
  );
}
