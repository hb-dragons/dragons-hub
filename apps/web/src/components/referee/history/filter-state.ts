import { SWR_KEYS } from "@/lib/swr-keys";
import type { HistoryStatusValue } from "@dragons/shared";

export type HistoryTab = "workload" | "games";
export type HistoryPreset = "season" | "30d" | "month" | "custom";

export interface HistoryFilterStateWithSearch {
  tab: HistoryTab;
  preset: HistoryPreset;
  dateFrom?: string;
  dateTo?: string;
  league?: string;
  status: HistoryStatusValue[];
  search?: string;
  ref?: number;
  offset: number;
  limit: 25 | 50 | 100;
}

type ParamSource =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

function read(source: ParamSource, key: string): string | undefined {
  if (source instanceof URLSearchParams) return source.get(key) ?? undefined;
  const raw = source[key];
  return typeof raw === "string" ? raw : undefined;
}

function parseStatus(raw: string | undefined): HistoryStatusValue[] {
  if (!raw || raw === "all") return [];
  if (raw === "active") return ["played"];
  const out: HistoryStatusValue[] = [];
  for (const part of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (part === "played" || part === "cancelled" || part === "forfeited") {
      out.push(part);
    }
  }
  return out;
}

const LIMIT_VALUES = [25, 50, 100] as const;
function parseLimit(raw: string | undefined): 25 | 50 | 100 {
  const n = Number(raw);
  return (LIMIT_VALUES as readonly number[]).includes(n)
    ? (n as 25 | 50 | 100)
    : 50;
}

function parseTab(raw: string | undefined): HistoryTab {
  return raw === "games" ? "games" : "workload";
}

function parsePreset(raw: string | undefined): HistoryPreset {
  return raw === "30d" || raw === "month" || raw === "custom" ? raw : "season";
}

export function parseHistoryFilterState(
  source: ParamSource,
): HistoryFilterStateWithSearch {
  const refRaw = read(source, "ref");
  const refNum = refRaw !== undefined ? Number(refRaw) : NaN;
  const offsetRaw = Number(read(source, "offset"));
  return {
    tab: parseTab(read(source, "tab")),
    preset: parsePreset(read(source, "preset")),
    dateFrom: read(source, "dateFrom"),
    dateTo: read(source, "dateTo"),
    league: read(source, "league"),
    status: parseStatus(read(source, "status")),
    search: read(source, "search"),
    ref: Number.isFinite(refNum) && refNum > 0 ? refNum : undefined,
    offset: Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0,
    limit: parseLimit(read(source, "limit")),
  };
}

export interface ResolvePresetInput {
  from: string;
  to: string;
  /**
   * Reference "today" for relative presets (30d, month). Interpreted in UTC —
   * pass a Date whose UTC components represent the day you want treated as
   * today (typically `new Date()` is fine; at month-boundary midnights in
   * non-UTC locales the `month` preset may resolve to the prior month).
   */
  today: Date;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function resolvePresetRange(
  preset: HistoryPreset,
  input: ResolvePresetInput,
  custom?: { dateFrom?: string; dateTo?: string },
): { dateFrom: string; dateTo: string } {
  if (preset === "season") {
    return { dateFrom: input.from, dateTo: input.to };
  }
  if (preset === "30d") {
    const end = input.today;
    const start = new Date(end);
    start.setUTCDate(end.getUTCDate() - 30);
    return { dateFrom: iso(start), dateTo: iso(end) };
  }
  if (preset === "month") {
    const today = input.today;
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
    return { dateFrom: iso(first), dateTo: iso(last) };
  }
  const firstOfMonth = new Date(Date.UTC(
    input.today.getUTCFullYear(), input.today.getUTCMonth(), 1,
  ));
  const lastOfMonth = new Date(Date.UTC(
    input.today.getUTCFullYear(), input.today.getUTCMonth() + 1, 0,
  ));
  return {
    dateFrom: custom?.dateFrom ?? iso(firstOfMonth),
    dateTo: custom?.dateTo ?? iso(lastOfMonth),
  };
}

interface HistoryQueryBase {
  dateFrom?: string;
  dateTo?: string;
  league?: string;
  status: readonly HistoryStatusValue[];
}

function buildHistoryQuery(
  state: HistoryQueryBase,
  extra: Record<string, string> = {},
  statusOverride?: "all",
): string {
  const p = new URLSearchParams();
  const statusStr = statusOverride
    ? statusOverride
    : state.status.length === 0
    ? "all"
    : state.status.join(",");
  p.set("status", statusStr);
  if (state.dateFrom) p.set("dateFrom", state.dateFrom);
  if (state.dateTo) p.set("dateTo", state.dateTo);
  if (state.league) p.set("league", state.league);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p.toString();
}

// Summary always forces status=all. Workload tab must not react to the
// games-tab status chip.
export function summaryKey(state: HistoryFilterStateWithSearch): string {
  return SWR_KEYS.refereeHistorySummary(
    buildHistoryQuery(state, {}, "all"),
  );
}

export function gamesKey(
  state: HistoryFilterStateWithSearch,
  limit: number,
  offset: number,
): string {
  const extra: Record<string, string> = {
    limit: String(limit),
    offset: String(offset),
  };
  if (state.search) extra.search = state.search;
  if (state.ref !== undefined) extra.refereeApiId = String(state.ref);
  return SWR_KEYS.refereeHistoryGames(buildHistoryQuery(state, extra));
}

export function gamesCsvUrl(state: HistoryFilterStateWithSearch): string {
  return SWR_KEYS.refereeHistoryGamesCsv(buildHistoryQuery(state));
}

export function leaderboardCsvUrl(
  state: HistoryFilterStateWithSearch,
): string {
  return SWR_KEYS.refereeHistoryLeaderboardCsv(
    buildHistoryQuery(state, {}, "all"),
  );
}
