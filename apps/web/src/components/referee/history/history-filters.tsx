"use client";

import { useTranslations } from "next-intl";
import { Button, DatePicker } from "@dragons/ui";
import { Input } from "@dragons/ui/components/input";
import { Label } from "@dragons/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select";
import { SearchIcon, XIcon } from "lucide-react";
import type {
  HistoryFilterState,
  HistoryFilterStateWithSearch,
} from "./filter-state";

interface Props {
  state: HistoryFilterStateWithSearch;
  onChange: (patch: Partial<HistoryFilterStateWithSearch>) => void;
  onReset: () => void;
  rangeLabel?: string | null;
}

export function HistoryFilters({ state, onChange, onReset, rangeLabel }: Props) {
  const t = useTranslations("refereeHistory");

  return (
    <div className="bg-card rounded-md">
      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field label={t("status.label")}>
          <Select
            value={state.status}
            onValueChange={(value) =>
              onChange({ status: value as HistoryFilterState["status"] })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">{t("status.active")}</SelectItem>
              <SelectItem value="all">{t("status.all")}</SelectItem>
              <SelectItem value="cancelled">{t("status.cancelled")}</SelectItem>
              <SelectItem value="forfeited">{t("status.forfeited")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label={t("filters.dateFrom")}>
          <DatePicker
            value={state.dateFrom ?? null}
            onChange={(value) => onChange({ dateFrom: value ?? undefined })}
            className="w-full"
          />
        </Field>

        <Field label={t("filters.dateTo")}>
          <DatePicker
            value={state.dateTo ?? null}
            onChange={(value) => onChange({ dateTo: value ?? undefined })}
            className="w-full"
          />
        </Field>

        <Field label={t("filters.league")}>
          <Input
            value={state.league ?? ""}
            onChange={(event) =>
              onChange({ league: event.target.value || undefined })
            }
          />
        </Field>

        <Field label={t("filters.search")}>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              value={state.search ?? ""}
              onChange={(event) =>
                onChange({ search: event.target.value || undefined })
              }
            />
          </div>
        </Field>
      </div>

      <div className="bg-surface-low rounded-b-md flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <span className="text-muted-foreground text-xs">
          {rangeLabel ?? ""}
        </span>
        <Button variant="ghost" size="sm" onClick={onReset}>
          <XIcon className="size-3.5" />
          {t("filters.reset")}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="font-display text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {label}
      </Label>
      {children}
    </div>
  );
}
