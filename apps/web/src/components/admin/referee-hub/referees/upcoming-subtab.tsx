"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { useTranslations } from "next-intl";
import { apiFetcher } from "@/lib/swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import type { RefereeGameListItem, RefereeListItem } from "@dragons/shared";

interface Props {
  referee: RefereeListItem;
}

interface ApiResp {
  items: RefereeGameListItem[];
}

export function UpcomingSubtab({ referee }: Props) {
  const t = useTranslations() as (key: string) => string;
  const { data } = useSWR<ApiResp>(SWR_KEYS.refereeGames, apiFetcher);
  const items = data?.items ?? [];

  const { assigned, eligibleOpen } = useMemo(() => {
    const assigned = items.filter((g) =>
      g.sr1RefereeApiId === referee.apiId || g.sr2RefereeApiId === referee.apiId,
    );
    const eligibleOpen = items.filter((g) =>
      (g.sr1Status === "open" || g.sr2Status === "open") &&
      (g.sr1OurClub || g.sr2OurClub) &&
      !g.isCancelled &&
      !g.isForfeited,
    );
    return { assigned, eligibleOpen };
  }, [items, referee.apiId]);

  return (
    <div className="p-4 space-y-6">
      <Section
        title={t("refereeHub.referees.upcoming.assigned")}
        count={assigned.length}
      >
        {assigned.map((g) => (
          <Row key={g.apiMatchId} game={g} />
        ))}
        {assigned.length === 0 && (
          <Empty text={t("refereeHub.referees.upcoming.assignedEmpty")} />
        )}
      </Section>
      <Section
        title={t("refereeHub.referees.upcoming.eligibleOpen")}
        count={eligibleOpen.length}
      >
        {eligibleOpen.map((g) => (
          <Row key={g.apiMatchId} game={g} />
        ))}
        {eligibleOpen.length === 0 && (
          <Empty text={t("refereeHub.referees.upcoming.eligibleOpenEmpty")} />
        )}
      </Section>
    </div>
  );
}

interface SectionProps {
  title: string;
  count: number;
  children: React.ReactNode;
}

function Section({ title, count, children }: SectionProps) {
  return (
    <section>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
        {title} ({count})
      </div>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

interface RowProps {
  game: RefereeGameListItem;
}

function Row({ game }: RowProps) {
  return (
    <div className="flex justify-between border rounded-md p-2 text-sm">
      <div>
        <div className="text-xs text-muted-foreground">
          {game.kickoffDate} · {game.kickoffTime} · {game.leagueShort ?? ""}
        </div>
        <div>
          {game.homeTeamName} vs {game.guestTeamName}
        </div>
      </div>
    </div>
  );
}

interface EmptyProps {
  text: string;
}

function Empty({ text }: EmptyProps) {
  return <div className="text-sm text-muted-foreground py-2">{text}</div>;
}
