import useSWR from "swr";
import { canViewOpenGames, type GateUser, type TodayItem } from "@dragons/shared";
import { refereeApi } from "@/lib/api";
import { i18n } from "@/lib/i18n";

function todayIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export const refereeProvider = {
  id: "referee",
  visible: (user: GateUser) => canViewOpenGames(user),
  useItems(user: GateUser): TodayItem[] {
    const enabled = canViewOpenGames(user);
    const { data } = useSWR(enabled ? "today:referee" : null, () =>
      refereeApi.getGames({ status: "active", limit: 500 }),
    );
    if (!data) return [];
    const today = todayIso();
    const items: TodayItem[] = [];

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
        route:
          next.matchId !== null
            ? `/game/${next.matchId}`
            : `/referee-game/${next.id}`,
        icon: "whistle",
      });
    }
    return items;
  },
};
