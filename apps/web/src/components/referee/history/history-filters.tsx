"use client";

import { useTranslations } from "next-intl";
import { Button } from "@dragons/ui";
import type { HistoryFilterState } from "@/hooks/use-referee-history";

interface Props {
  state: HistoryFilterState & { search?: string };
  onChange: (patch: Partial<HistoryFilterState & { search?: string }>) => void;
  onReset: () => void;
}

export function HistoryFilters({ state, onChange, onReset }: Props) {
  const t = useTranslations("refereeHistory");

  return (
    <div className="flex flex-wrap gap-3 items-end">
      <label className="flex flex-col text-sm">
        {t("mode.label")}
        <select
          className="border rounded px-2 py-1"
          value={state.mode}
          onChange={(e) => onChange({ mode: e.target.value as HistoryFilterState["mode"] })}
        >
          <option value="obligation">{t("mode.obligation")}</option>
          <option value="activity">{t("mode.activity")}</option>
        </select>
      </label>

      <label className="flex flex-col text-sm">
        {t("status.label")}
        <select
          className="border rounded px-2 py-1"
          value={state.status}
          onChange={(e) => onChange({ status: e.target.value as HistoryFilterState["status"] })}
        >
          <option value="active">{t("status.active")}</option>
          <option value="all">{t("status.all")}</option>
          <option value="cancelled">{t("status.cancelled")}</option>
          <option value="forfeited">{t("status.forfeited")}</option>
        </select>
      </label>

      <label className="flex flex-col text-sm">
        {t("filters.dateFrom")}
        <input
          type="date"
          className="border rounded px-2 py-1"
          value={state.dateFrom ?? ""}
          onChange={(e) => onChange({ dateFrom: e.target.value || undefined })}
        />
      </label>

      <label className="flex flex-col text-sm">
        {t("filters.dateTo")}
        <input
          type="date"
          className="border rounded px-2 py-1"
          value={state.dateTo ?? ""}
          onChange={(e) => onChange({ dateTo: e.target.value || undefined })}
        />
      </label>

      <label className="flex flex-col text-sm">
        {t("filters.league")}
        <input
          type="text"
          className="border rounded px-2 py-1 w-24"
          value={state.league ?? ""}
          onChange={(e) => onChange({ league: e.target.value || undefined })}
        />
      </label>

      <label className="flex flex-col text-sm">
        {t("filters.search")}
        <input
          type="text"
          className="border rounded px-2 py-1"
          value={state.search ?? ""}
          onChange={(e) => onChange({ search: e.target.value || undefined })}
        />
      </label>

      <Button variant="outline" size="sm" onClick={onReset}>
        {t("filters.reset")}
      </Button>
    </div>
  );
}
