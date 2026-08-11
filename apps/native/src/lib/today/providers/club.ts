import useSWR from "swr";
import type { GateUser } from "@dragons/shared";
import type { NativeTodayItem } from "@/lib/today/types";
import { publicApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";

export const clubProvider = {
  id: "club",
  visible: (_user: GateUser) => true,
  useItems(user: GateUser): NativeTodayItem[] {
    const enabled = Boolean(user);
    const { data } = useSWR(enabled ? "today:club" : null, () =>
      publicApi.getHomeDashboard(),
    );
    if (!data?.nextGame) return [];
    const g = data.nextGame;
    return [
      {
        id: `next-game-${g.id}`,
        providerId: "club",
        title: i18n.t("today.nextGame", {
          teams: `${g.homeTeamName} – ${g.guestTeamName}`,
        }),
        subtitle: g.kickoffDate,
        urgency: 40,
        route: `/game/${g.id}`,
        icon: "basketball",
      },
    ];
  },
};
