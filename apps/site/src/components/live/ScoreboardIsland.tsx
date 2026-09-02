/**
 * Live board island on home: initial state from GET /public/broadcast/state,
 * then the /public/broadcast/stream SSE feed with exponential-backoff
 * reconnect — the same state the OBS overlay consumes, and (deliberately) the
 * overlay's own look: the score bug and pregame card from
 * apps/web/src/app/[locale]/overlay, ported without the stream-only extras
 * (shot clock, NumberFlow score animation) and with a Twitch CTA instead.
 *
 * The graphic is a broadcast asset, not a themed card: it is wrapped in a
 * `.dark` scope so the surface tokens resolve to the dark tier in both site
 * themes — `bg-surface-low` under the light theme would paint white behind
 * `text-white`. Sizes are the overlay's own; the bug shrinks on phones via
 * `zoom` (the same mechanism the overlay uses to scale up at 1080p).
 *
 * Renders nothing at all unless a broadcast is on — every connect/hide/
 * degrade decision lives in lib/scoreboard.ts (unit-tested); this file only
 * wires the browser built-ins and the markup.
 */
import { useEffect, useState, type ReactNode } from "react";
import { DEFAULT_API_BASE } from "../../lib/api-base";
import { interpolate } from "../../lib/clock-interpolation";
import {
  DEFAULT_SCOREBOARD_DEVICE_ID,
  startLiveBoardClient,
  type BroadcastMatchView,
  type BroadcastTeamView,
  type LiveBoardView,
  type LiveSnapshot,
} from "../../lib/scoreboard";
import { SOCIAL_LINKS } from "../../lib/site-assets";
import { strings } from "../../lib/strings";
import { ClubLogo } from "../game/ClubLogo";

const API_BASE =
  (import.meta.env.PUBLIC_API_URL as string | undefined) ?? DEFAULT_API_BASE;
const DEVICE_ID =
  (import.meta.env.PUBLIC_SCOREBOARD_DEVICE_ID as string | undefined) ??
  DEFAULT_SCOREBOARD_DEVICE_ID;

// FIBA Art. 41.1.1: team-foul limit reached at 4 fouls/quarter. The 5th cell
// is a bonus indicator (lights at >=4), not a 5th countable foul.
const MAX_FOUL_PIPS = 5;
const TEAM_FOUL_BONUS_AT = 4;
// FIBA Art. 18.2.5: H1 (Q1+Q2) = 2 timeouts, H2 (Q3+Q4) = 3, each OT = 1.
function timeoutPipsForPeriod(period: number): number {
  if (period <= 2) return 2;
  if (period <= 4) return 3;
  return 1;
}

// Twitch brand purple; not part of the site palette, so it stays inline.
const TWITCH_PURPLE = "#9146ff";

function PeriodBadge({ period }: { period: number }): ReactNode {
  if (period <= 0) return "—";
  if (period <= 4) {
    // English broadcast ordinal notation ("1ST"…"4TH") is the convention on
    // the TV graphic itself and is deliberately not localised.
    const suffix = (["ST", "ND", "RD", "TH"] as const)[period - 1];
    return (
      <span className="inline-flex items-baseline gap-px whitespace-nowrap leading-none tracking-normal">
        <span className="tabular-nums">{period}</span>
        <sup className="-top-[0.35em] relative text-[0.58em] font-bold">{suffix}</sup>
      </span>
    );
  }
  if (period === 5) {
    return <span className="tracking-[0.2em]">{strings.scoreboard.overtime}</span>;
  }
  return (
    <span className="tabular-nums tracking-[0.2em]">
      {strings.scoreboard.overtime}
      {period - 4}
    </span>
  );
}

function Crest({ team, className }: { team: BroadcastTeamView; className: string }) {
  return (
    <ClubLogo
      clubId={team.clubId}
      isOwnClub={false}
      alt={team.name}
      className={`${className} object-contain`}
      fallbackClassName="text-3xl"
    />
  );
}

function LogoCap({ team }: { team: BroadcastTeamView }) {
  return (
    <div className="flex shrink-0 items-center justify-center p-2">
      <Crest team={team} className="h-full w-full max-h-13" />
    </div>
  );
}

function TeamPanel({
  abbr,
  fouls,
  timeouts,
  period,
}: {
  abbr: string;
  fouls: number;
  timeouts: number;
  period: number;
}) {
  return (
    <div className="flex w-28 shrink-0 flex-col items-center mt-4 px-3 relative">
      <div className="text-4xl font-bold italic leading-none tracking-tight text-white">
        {abbr}
      </div>
      <div className="flex flex-col justify-center items-center gap-1.5 absolute bottom-2 left-0 right-0">
        <FoulPips fouls={fouls} />
        <TimeoutPips timeouts={timeouts} period={period} />
      </div>
    </div>
  );
}

function ScoreCell({ value }: { value: number }) {
  return (
    <div className="flex w-20 shrink-0 items-center justify-center">
      <span className="text-[2.7rem] font-black tabular-nums leading-[0.85] text-white">
        {value}
      </span>
    </div>
  );
}

function ClockCell({ clockText, period }: { clockText: string; period: number }) {
  return (
    <div className="w-28 flex shrink-0 flex-col bg-surface-lowest rounded-r-lg py-2 px-4">
      <span className="text-2xl font-black tabular-nums leading-none">
        {clockText || "--:--"}
      </span>
      <span className="text-lg font-bold uppercase">
        <PeriodBadge period={period} />
      </span>
    </div>
  );
}

function FoulPips({ fouls }: { fouls: number }) {
  const filled = Math.min(Math.max(fouls, 0), MAX_FOUL_PIPS);
  const bonus = fouls >= TEAM_FOUL_BONUS_AT;
  return (
    <div className="flex items-center gap-1" aria-hidden="true">
      {Array.from({ length: MAX_FOUL_PIPS }, (_, i) => {
        const isBonus = i === MAX_FOUL_PIPS - 1;
        const active = isBonus ? bonus : i < filled;
        const cls = active ? (isBonus ? "bg-red-500" : "bg-white") : "bg-white/20";
        return <span key={i} className={`size-1.5 rounded-full ${cls}`} />;
      })}
    </div>
  );
}

function TimeoutPips({ timeouts, period }: { timeouts: number; period: number }) {
  const total = timeoutPipsForPeriod(period);
  const filled = Math.min(Math.max(timeouts, 0), total);
  return (
    <div className="flex items-center gap-1" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-[3px] w-3 rounded-[1px] ${i < filled ? "bg-white/85" : "bg-white/20"}`}
        />
      ))}
    </div>
  );
}

// UI-only convention; DBB/FIBA rules don't define a low-shot-clock threshold.
const SHOT_CLOCK_RED_AT = 5;

function ShotClockCap({
  shotClockText,
  timeoutActive,
}: {
  shotClockText: string;
  timeoutActive: boolean;
}) {
  if (timeoutActive) {
    return (
      <div className="flex w-12 h-8 shrink-0 items-center justify-center bg-red-500">
        <span className="text-xl font-black uppercase text-white">
          {strings.scoreboard.timeoutShort}
        </span>
      </div>
    );
  }
  const remaining = Number.parseFloat(shotClockText);
  const red = Number.isFinite(remaining) && remaining > 0 && remaining <= SHOT_CLOCK_RED_AT;
  return (
    <div className="flex w-12 h-8 shrink-0 items-center justify-center">
      <span
        className={`text-2xl font-bold tabular-nums leading-none ${red ? "text-heat" : "text-white"}`}
      >
        {shotClockText}
      </span>
    </div>
  );
}

function LiveBug({
  match,
  scoreboard,
  clockText,
  shotClockText,
}: {
  match: BroadcastMatchView | null;
  scoreboard: LiveSnapshot;
  clockText: string;
  shotClockText: string;
}) {
  return (
    <div className="flex items-stretch justify-center [zoom:0.55] sm:[zoom:0.8] md:[zoom:1]">
      <div className="flex h-20 items-stretch overflow-hidden rounded-md bg-surface-lowest">
        {match && <LogoCap team={match.home} />}
        <TeamPanel
          abbr={match?.home.abbr ?? strings.scoreboard.home}
          fouls={scoreboard.foulsHome}
          timeouts={scoreboard.timeoutsHome}
          period={scoreboard.period}
        />
        <div className="flex items-start gap-2">
          <div className="bg-surface-highest flex px-4 py-1.5 rounded-b-xl gap-4">
            <ScoreCell value={scoreboard.scoreHome} />
            <div className="flex w-0.5 py-2">
              <div className="flex-1 bg-primary"></div>
            </div>
            <ScoreCell value={scoreboard.scoreGuest} />
          </div>
        </div>
        <TeamPanel
          abbr={match?.guest.abbr ?? strings.scoreboard.guest}
          fouls={scoreboard.foulsGuest}
          timeouts={scoreboard.timeoutsGuest}
          period={scoreboard.period}
        />
        {match && <LogoCap team={match.guest} />}
      </div>
      <div className="flex justify-center items-center">
        <div className="flex">
          <ClockCell clockText={clockText} period={scoreboard.period} />
          <div className="flex justify-center items-center">
            <div className="-ml-4 flex justify-center items-center bg-surface-high rounded-md overflow-hidden">
              <ShotClockCap
                shotClockText={shotClockText}
                timeoutActive={scoreboard.timeoutActive}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LiveCard({
  match,
  scoreboard,
  clockText,
  shotClockText,
}: {
  match: BroadcastMatchView | null;
  scoreboard: LiveSnapshot;
  clockText: string;
  shotClockText: string;
}) {
  return (
    <div className="w-[min(820px,100%)] mx-auto overflow-hidden rounded-md bg-surface-low drop-shadow-[0_16px_40px_rgba(0,0,0,0.55)]">
      {match && <ColorBars home={match.home.color} guest={match.guest.color} />}
      <div className="flex flex-col items-center gap-3 px-3 py-5 md:px-6 md:py-6">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="relative flex size-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75"></span>
            <span className="relative inline-flex size-2.5 rounded-full bg-red-500"></span>
          </span>
          <span className="rounded-sm bg-red-500 px-2 py-0.5 text-[0.7rem] font-black uppercase tracking-widest text-white">
            {strings.scoreboard.liveBadge}
          </span>
          {match?.leagueName && (
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-white/65">
              {match.leagueName}
            </span>
          )}
        </div>
        <LiveBug
          match={match}
          scoreboard={scoreboard}
          clockText={clockText}
          shotClockText={shotClockText}
        />
      </div>
      {match && <ColorBars home={match.home.color} guest={match.guest.color} />}
    </div>
  );
}

function ColorBars({ home, guest }: { home: string; guest: string }) {
  return (
    <div aria-hidden="true" className="grid h-1.5 grid-cols-2">
      <div style={{ background: home }} />
      <div style={{ background: guest }} />
    </div>
  );
}

function TwitchCta() {
  return (
    <a
      href={SOCIAL_LINKS.twitch}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold uppercase tracking-wider text-white transition-opacity hover:opacity-85"
      style={{ backgroundColor: TWITCH_PURPLE }}
    >
      <span aria-hidden="true" className="relative flex size-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75"></span>
        <span className="relative inline-flex size-2 rounded-full bg-white"></span>
      </span>
      {strings.scoreboard.twitchCta}
    </a>
  );
}

/** A view plus the wall-clock instant it arrived — the interpolation anchor. */
interface BoardEntry {
  view: LiveBoardView;
  anchorAt: number;
}

export default function ScoreboardIsland() {
  const [entry, setEntry] = useState<BoardEntry | null>(null);
  const [nowMs, setNowMs] = useState(0);

  useEffect(
    () =>
      startLiveBoardClient({
        baseUrl: API_BASE,
        deviceId: DEVICE_ID,
        onChange: (view) =>
          setEntry(view === null ? null : { view, anchorAt: Date.now() }),
        fetchImpl: (url) => fetch(url),
        createEventSource: (url) => new EventSource(url),
        schedule: (fn, ms) => window.setTimeout(fn, ms),
        cancel: (handle) => window.clearTimeout(handle as number),
      }),
    [],
  );

  // The stream only carries real changes; the ticking clocks advance locally
  // off the last anchor, same as the OBS overlay's clock interpolation.
  const running = entry !== null && entry.view.scoreboard.clockRunning;
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [running]);

  if (entry === null) return null;
  const { view, anchorAt } = entry;

  const sb = view.scoreboard;
  const { clockText, shotClockText } = interpolate(
    {
      clockMs: sb.clockMs,
      clockText: sb.clockText,
      shotClock: sb.shotClock,
      shotClockText: sb.shotClockText,
      clockRunning: sb.clockRunning,
      timeoutActive: sb.timeoutActive,
      anchorAt,
    },
    Math.max(nowMs, anchorAt),
  );
  const body: ReactNode = (
    <LiveCard
      match={view.match}
      scoreboard={sb}
      clockText={clockText}
      shotClockText={shotClockText}
    />
  );

  return (
    <section
      aria-label={strings.scoreboard.sectionLabel}
      className="dark mx-auto max-w-5xl px-4 pt-8 md:pt-10 font-display"
    >
      <div className="flex flex-col items-center gap-4 drop-shadow-[0_12px_32px_rgba(0,0,0,0.55)]">
        {body}
        <TwitchCta />
      </div>
    </section>
  );
}
