import { notFound } from "next/navigation";
import { getPublicApi } from "@/lib/api-client.server";
import { getTranslations, getFormatter } from "next-intl/server";
import { Link } from "@/lib/navigation";
import type { PublicMatchDetail, FormEntry } from "@dragons/shared";
import { resolveTeamName } from "@/components/public/schedule/types";
import { cn } from "@dragons/ui/lib/utils";
import { ClubLogo } from "@/components/brand/club-logo";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function teamName(match: PublicMatchDetail, side: "home" | "guest") {
  if (side === "home")
    return resolveTeamName({
      customName: match.homeTeamCustomName,
      nameShort: match.homeTeamNameShort,
      name: match.homeTeamName,
    });
  return resolveTeamName({
    customName: match.guestTeamCustomName,
    nameShort: match.guestTeamNameShort,
    name: match.guestTeamName,
  });
}

interface QuarterColumn {
  label: string;
  home: number | null;
  guest: number | null;
}

function buildQuarterColumns(
  match: PublicMatchDetail,
  labels: { halftime: string; overtime: string; total: string },
): QuarterColumn[] {
  const cols: QuarterColumn[] = [];

  const qKeys = [1, 2, 3, 4, 5, 6, 7, 8] as const;
  for (const n of qKeys) {
    const h = match[`homeQ${n}` as keyof PublicMatchDetail] as number | null;
    const g = match[`guestQ${n}` as keyof PublicMatchDetail] as number | null;
    if (h !== null || g !== null) {
      cols.push({ label: `Q${n}`, home: h, guest: g });
    }
  }

  // Halftime
  if (match.homeHalftimeScore !== null || match.guestHalftimeScore !== null) {
    cols.push({
      label: labels.halftime,
      home: match.homeHalftimeScore,
      guest: match.guestHalftimeScore,
    });
  }

  // Overtime
  if (match.homeOt1 !== null || match.guestOt1 !== null) {
    cols.push({ label: `${labels.overtime}1`, home: match.homeOt1, guest: match.guestOt1 });
  }
  if (match.homeOt2 !== null || match.guestOt2 !== null) {
    cols.push({ label: `${labels.overtime}2`, home: match.homeOt2, guest: match.guestOt2 });
  }

  // Total
  if (match.homeScore !== null || match.guestScore !== null) {
    cols.push({ label: labels.total, home: match.homeScore, guest: match.guestScore });
  }

  return cols;
}

// ---------------------------------------------------------------------------
// Inline components
// ---------------------------------------------------------------------------

function FormStrip({ form, labels }: { form: FormEntry[]; labels: { win: string; loss: string } }) {
  return (
    <div className="flex gap-1">
      {form.slice(0, 5).map((entry, i) => (
        <span
          key={i}
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md font-display text-xs font-bold",
            entry.result === "W"
              ? "bg-primary/15 text-primary"
              : "bg-destructive/15 text-destructive",
          )}
        >
          {entry.result === "W" ? labels.win : labels.loss}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function GameDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numId = Number(id);
  if (Number.isNaN(numId)) notFound();

  const t = await getTranslations("public");
  const format = await getFormatter();

  const tRaw = t.raw as (key: string) => unknown;
  const gd = tRaw("gameDetail") as {
    final: string;
    quarters: string;
    halftime: string;
    overtime: string;
    total: string;
    headToHead: string;
    viewAllH2H: string;
    form: string;
    details: string;
    venue: string;
    address: string;
    scorer: string;
    timekeeper: string;
    status: string;
    confirmed: string;
    cancelled: string;
    forfeited: string;
    win: string;
    loss: string;
    record: string;
    ptsFor: string;
    ptsAgainst: string;
    noData: string;
  };

  const api = getPublicApi();
  const [match, context] = await Promise.all([
    api.getMatch(numId).catch(() => null),
    api.getMatchContext(numId).catch(() => null),
  ]);

  if (!match) notFound();

  const homeName = teamName(match, "home");
  const guestName = teamName(match, "guest");
  const hasScore = match.homeScore !== null && match.guestScore !== null;
  const homeWon = hasScore && match.homeScore! > match.guestScore!;
  const guestWon = hasScore && match.guestScore! > match.homeScore!;

  const venueName = match.venueNameOverride || match.venueName;
  const addressParts = [
    match.venueStreet,
    [match.venuePostalCode, match.venueCity].filter(Boolean).join(" "),
  ].filter(Boolean);
  const address = addressParts.length > 0 ? addressParts.join(", ") : null;

  const opponentApiId = match.homeIsOwnClub
    ? match.guestTeamApiId
    : match.homeTeamApiId;

  const quarterCols = buildQuarterColumns(match, {
    halftime: gd.halftime,
    overtime: gd.overtime,
    total: gd.total,
  });

  return (
    <div className="space-y-6">
      {/* ── 1. Score Card ── */}
      <section className="rounded-md bg-card p-5">
        {/* Meta: date / time / league / venue */}
        <div className="mb-4 space-y-0.5 text-center">
          {match.kickoffDate && (
            <p className="text-xs text-muted-foreground">
              {format.dateTime(new Date(match.kickoffDate + "T12:00:00"), {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
              {match.kickoffTime && ` · ${match.kickoffTime.slice(0, 5)}`}
            </p>
          )}
          {match.leagueName && (
            <p className="text-xs text-muted-foreground">{match.leagueName}</p>
          )}
          {venueName && (
            <p className="text-xs text-muted-foreground">{venueName}</p>
          )}
        </div>

        {/* Teams + Score */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-1 flex-col items-center gap-2">
            <ClubLogo clubId={match.homeClubId} size={40} />
            <p
              className={cn(
                "font-semibold",
                match.homeIsOwnClub ? "text-primary" : "text-foreground",
              )}
            >
              {homeName}
            </p>
          </div>

          <div className="text-center">
            {hasScore ? (
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "font-display text-3xl tabular-nums",
                    homeWon
                      ? "font-bold text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {match.homeScore}
                </span>
                <span className="text-muted-foreground">:</span>
                <span
                  className={cn(
                    "font-display text-3xl tabular-nums",
                    guestWon
                      ? "font-bold text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {match.guestScore}
                </span>
              </div>
            ) : (
              <span className="font-display text-xl text-muted-foreground">
                {t("vs")}
              </span>
            )}
          </div>

          <div className="flex flex-1 flex-col items-center gap-2">
            <ClubLogo clubId={match.guestClubId} size={40} />
            <p
              className={cn(
                "font-semibold",
                match.guestIsOwnClub ? "text-primary" : "text-foreground",
              )}
            >
              {guestName}
            </p>
          </div>
        </div>

        {/* Final label + status badges */}
        <div className="mt-3 flex flex-col items-center gap-1.5">
          {hasScore && (
            <span className="font-display text-xs font-medium uppercase tracking-wider text-primary">
              {gd.final}
            </span>
          )}
          {match.isCancelled && (
            <span className="rounded-4xl bg-destructive/15 px-2.5 py-0.5 font-display text-xs font-semibold uppercase tracking-wide text-destructive">
              {gd.cancelled}
            </span>
          )}
          {match.isForfeited && (
            <span className="rounded-4xl bg-heat/10 px-2.5 py-0.5 font-display text-xs font-semibold uppercase tracking-wide text-heat">
              {gd.forfeited}
            </span>
          )}
        </div>
      </section>

      {/* ── 2. Quarter Table ── */}
      {quarterCols.length > 0 && (
        <section>
          <p className="mb-2 font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {gd.quarters}
          </p>
          <div className="overflow-x-auto rounded-md bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-low">
                  <th className="px-3 py-2 text-left font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    &nbsp;
                  </th>
                  {quarterCols.map((col) => (
                    <th
                      key={col.label}
                      className={cn(
                        "px-3 py-2 text-center font-display text-xs font-medium uppercase tracking-wider text-muted-foreground",
                        col.label === gd.total && "bg-surface-low",
                      )}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Home row */}
                <tr>
                  <td
                    className={cn(
                      "px-3 py-2 font-medium",
                      match.homeIsOwnClub ? "text-primary" : "text-foreground",
                    )}
                  >
                    {homeName}
                  </td>
                  {quarterCols.map((col) => (
                    <td
                      key={col.label}
                      className={cn(
                        "px-3 py-2 text-center tabular-nums",
                        col.label === gd.total && "font-bold",
                      )}
                    >
                      {col.home ?? "-"}
                    </td>
                  ))}
                </tr>
                {/* Guest row */}
                <tr>
                  <td
                    className={cn(
                      "px-3 py-2 font-medium",
                      match.guestIsOwnClub
                        ? "text-primary"
                        : "text-foreground",
                    )}
                  >
                    {guestName}
                  </td>
                  {quarterCols.map((col) => (
                    <td
                      key={col.label}
                      className={cn(
                        "px-3 py-2 text-center tabular-nums",
                        col.label === gd.total && "font-bold",
                      )}
                    >
                      {col.guest ?? "-"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── 3. Head-to-Head ── */}
      {context && context.headToHead.previousMeetings.length > 0 && (
        <section>
          <p className="mb-2 font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {gd.headToHead}
          </p>
          <div className="rounded-md bg-card p-4">
            {/* Summary stats */}
            <div className="mb-4 grid grid-cols-4 gap-4 text-center">
              <div>
                <p className="font-display text-xl font-bold text-primary">
                  {context.headToHead.wins}
                </p>
                <p className="text-xs text-muted-foreground">{gd.win}</p>
              </div>
              <div>
                <p className="font-display text-xl font-bold text-destructive">
                  {context.headToHead.losses}
                </p>
                <p className="text-xs text-muted-foreground">{gd.loss}</p>
              </div>
              <div>
                <p className="font-display text-xl font-bold">
                  {context.headToHead.pointsFor}
                </p>
                <p className="text-xs text-muted-foreground">{gd.ptsFor}</p>
              </div>
              <div>
                <p className="font-display text-xl font-bold">
                  {context.headToHead.pointsAgainst}
                </p>
                <p className="text-xs text-muted-foreground">
                  {gd.ptsAgainst}
                </p>
              </div>
            </div>

            {/* Previous meetings (last 5) */}
            <div className="space-y-2">
              {context.headToHead.previousMeetings.slice(0, 5).map((m) => (
                <Link key={m.matchId} href={`/game/${m.matchId}`}>
                  <div
                    className={cn(
                      "flex items-center justify-between rounded-md bg-surface-low px-3 py-2 border-l-2",
                      m.isWin
                        ? "border-l-primary"
                        : "border-l-destructive",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        <span
                          className={
                            m.homeIsOwnClub ? "text-primary font-medium" : ""
                          }
                        >
                          {m.homeTeamName}
                        </span>
                        {" "}
                        <span className="text-muted-foreground">{t("vs")}</span>
                        {" "}
                        <span
                          className={
                            !m.homeIsOwnClub ? "text-primary font-medium" : ""
                          }
                        >
                          {m.guestTeamName}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format.dateTime(new Date(m.date + "T12:00:00"), {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <p className="ml-3 font-display text-sm font-bold tabular-nums">
                      {m.homeScore}:{m.guestScore}
                    </p>
                  </div>
                </Link>
              ))}
            </div>

            {/* Link to full H2H */}
            <div className="mt-3 text-center">
              <Link
                href={`/h2h/${opponentApiId}`}
                className="text-xs font-medium text-primary hover:underline"
              >
                {gd.viewAllH2H}
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── 4. Form ── */}
      {context &&
        (context.homeForm.length > 0 || context.guestForm.length > 0) && (
          <section>
            <p className="mb-2 font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {gd.form}
            </p>
            <div className="space-y-3 rounded-md bg-card p-4">
              {/* Own-club form first */}
              <div className="flex items-center gap-3">
                <span className="w-20 truncate text-sm font-semibold text-primary">
                  {match.homeIsOwnClub ? homeName : guestName}
                </span>
                <FormStrip
                  form={
                    match.homeIsOwnClub
                      ? context.homeForm
                      : context.guestForm
                  }
                  labels={{ win: gd.win, loss: gd.loss }}
                />
              </div>
              {/* Opponent form */}
              <div className="flex items-center gap-3">
                <span className="w-20 truncate text-sm text-muted-foreground">
                  {match.homeIsOwnClub ? guestName : homeName}
                </span>
                <FormStrip
                  form={
                    match.homeIsOwnClub
                      ? context.guestForm
                      : context.homeForm
                  }
                  labels={{ win: gd.win, loss: gd.loss }}
                />
              </div>
            </div>
          </section>
        )}

      {/* ── 5. Details ── */}
      <section>
        <p className="mb-2 font-display text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {gd.details}
        </p>
        <div className="rounded-md bg-card p-4">
          <dl className="space-y-3 text-sm">
            {venueName && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{gd.venue}</dt>
                <dd className="text-right font-medium">{venueName}</dd>
              </div>
            )}
            {address && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{gd.address}</dt>
                <dd className="text-right font-medium">{address}</dd>
              </div>
            )}
            {match.anschreiber && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{gd.scorer}</dt>
                <dd className="text-right font-medium">
                  {match.anschreiber}
                </dd>
              </div>
            )}
            {match.zeitnehmer && (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{gd.timekeeper}</dt>
                <dd className="text-right font-medium">
                  {match.zeitnehmer}
                </dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">{gd.status}</dt>
              <dd className="flex gap-2">
                {match.isConfirmed && (
                  <span className="rounded-4xl bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    {gd.confirmed}
                  </span>
                )}
                {match.isCancelled && (
                  <span className="rounded-4xl bg-destructive/15 px-2.5 py-0.5 text-xs font-semibold text-destructive">
                    {gd.cancelled}
                  </span>
                )}
                {match.isForfeited && (
                  <span className="rounded-4xl bg-heat/10 px-2.5 py-0.5 text-xs font-semibold text-heat">
                    {gd.forfeited}
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}
