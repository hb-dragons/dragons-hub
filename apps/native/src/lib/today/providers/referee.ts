import useSWR from "swr";
import { canViewOpenGames, type GateUser } from "@dragons/shared";
import type { NativeTodayItem } from "@/lib/today/types";
import { refereeApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";
import { kickoffToday } from "@/lib/format/kickoff";
import { refereeGameRoute } from "@/lib/referee/einsatz";

export const refereeProvider = {
  id: "referee",
  visible: (user: GateUser) => canViewOpenGames(user),
  useItems(user: GateUser): NativeTodayItem[] {
    const enabled = canViewOpenGames(user);
    const { data } = useSWR(enabled ? "today:referee" : null, () =>
      refereeApi.getGames({ status: "active", limit: 500 }),
    );
    if (!data) return [];
    const today = kickoffToday();
    const items: NativeTodayItem[] = [];

    const openCount = data.items.filter(
      (g) =>
        g.kickoffDate >= today &&
        g.mySlot === null &&
        !g.isCancelled &&
        !g.isForfeited &&
        ((g.sr1OurClub && g.sr1Status !== "assigned") ||
          (g.sr2OurClub && g.sr2Status !== "assigned") ||
          g.sr1Status === "offered" ||
          g.sr2Status === "offered"),
    ).length;
    if (openCount > 0) {
      items.push({
        id: "open-slots",
        providerId: "referee",
        title: i18n.t("today.openSlots", { count: openCount }),
        urgency: 70,
        route: "/officiating",
        icon: "whistle",
      });
    }

    const next = data.items
      .filter((g) => g.mySlot !== null && g.kickoffDate >= today)
      .sort((a, b) => a.kickoffDate.localeCompare(b.kickoffDate))[0];
    if (next) {
      items.push({
        id: `assignment-${next.id}`,
        providerId: "referee",
        title: i18n.t("today.nextAssignment", {
          teams: `${next.homeTeamName} – ${next.guestTeamName}`,
        }),
        subtitle: next.kickoffDate,
        urgency: 80,
        route: refereeGameRoute(next),
        icon: "whistle",
      });
    }
    return items;
  },
};
