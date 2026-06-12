"use client";

import useSWR from "swr";
import { useTranslations } from "next-intl";
import { queries } from "@/lib/swr-queries";
import type { RefereeGameListItem, RefereeListItem } from "@dragons/shared";

interface Props {
  referee: RefereeListItem;
}

export function UpcomingSubtab({ referee }: Props) {
  const t = useTranslations() as (key: string) => string;

  const assignedQ = queries.refereeGamesFiltered({ assignedRefereeApiId: referee.apiId, status: "active", limit: 100 });
  const eligibleQ = queries.refereeEligibleGames(referee.id);

  const { data: assignedData } = useSWR(assignedQ.key, assignedQ.fetcher);
  const { data: eligibleData } = useSWR(eligibleQ.key, eligibleQ.fetcher);

  const assigned = assignedData?.items ?? [];
  const eligible = eligibleData?.items ?? [];

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
        count={eligible.length}
      >
        {eligible.map((g) => (
          <Row key={g.apiMatchId} game={g} />
        ))}
        {eligible.length === 0 && (
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
    <div className="flex justify-between bg-surface-low rounded-md p-2 text-sm">
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
