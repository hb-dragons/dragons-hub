"use client";

import useSWR from "swr";
import { useTranslations } from "next-intl";
import { queries } from "@/lib/swr-queries";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select";

/**
 * Which season the surrounding admin view is looking at.
 *
 * `value` is `undefined` for "whatever the API considers active" rather than the
 * active season's id. That is deliberate: the server prefetch renders before any
 * season list has loaded, so leaving the choice unstated keeps the client on the
 * same SWR key as the prefetch instead of refetching the identical list under a
 * season-qualified key the moment the dropdown populates.
 */
/**
 * Collapse a pick of the active season back to `undefined`.
 *
 * Without this, choosing the season you are already looking at would move the
 * view off the prefetched cache entry onto a season-qualified key holding the
 * identical list, costing a fetch to display what is already on screen.
 */
export function normalizeSeasonPick(
  picked: number,
  activeId: number | undefined,
): number | undefined {
  return picked === activeId ? undefined : picked;
}

export function SeasonContextSelect({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (seasonId: number | undefined) => void;
}) {
  const t = useTranslations();
  const q = queries.seasons();
  const { data: seasons } = useSWR(q.key, q.fetcher);

  // One season means there is nothing to switch between; the control would only
  // add noise to the header.
  if (!seasons || seasons.length < 2) return null;

  const activeId = seasons.find((s) => s.status === "active")?.id;

  return (
    <Select
      value={value === undefined ? (activeId?.toString() ?? "") : value.toString()}
      onValueChange={(next) => onChange(normalizeSeasonPick(Number(next), activeId))}
    >
      <SelectTrigger className="w-[220px]" aria-label={t("settings.seasons.contextLabel")}>
        <SelectValue placeholder={t("settings.seasons.contextLabel")} />
      </SelectTrigger>
      <SelectContent>
        {seasons.map((s) => (
          <SelectItem key={s.id} value={s.id.toString()}>
            {s.name} · {t(`settings.seasons.status.${s.status}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
