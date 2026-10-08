"use client";

import { todayInClubZone } from "@dragons/shared";
import { queries } from "@/lib/swr-queries";
import { usePagedList } from "@/hooks/use-paged-list";
import { openGamesQueryOpts } from "./open-games-query";
import type { HubFilters } from "../use-referee-hub-url";

/**
 * The open games under the hub filters, page by page. The tab reads it once
 * and hands the count to the toolbar and the rows to the agenda.
 *
 * Starts with one page and grows when the agenda asks for more (it used to stop
 * at the first page and silently drop the rest, although the count showed the
 * full total). All loaded pages share one key under `/referee/games?`, so the
 * revalidation an assignment triggers (`isOpenGamesListKey`) refreshes them all.
 */
export function useOpenGames(filters: HubFilters) {
  const today = todayInClubZone();
  const firstPageKey = queries.refereeGamesFiltered(openGamesQueryOpts(filters, today)).key;
  const { items, ...rest } = usePagedList(firstPageKey, (page) =>
    queries.refereeGamesFiltered(openGamesQueryOpts(filters, today, page)).fetcher(),
  );
  return { games: items, ...rest };
}
