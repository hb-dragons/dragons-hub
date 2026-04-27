"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@dragons/ui/components/badge";
import { Button } from "@dragons/ui/components/button";
import { Input } from "@dragons/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dragons/ui/components/select";
import { TASK_PRIORITIES, type TaskPriority } from "@dragons/shared";
import { X } from "lucide-react";
import { useBoardFilters } from "@/hooks/use-board-filters";
import { AssigneePicker } from "./assignee-picker";
import { useUsers } from "@/hooks/use-users";

export function TaskFilters() {
  const t = useTranslations("board");
  const { filters, setAssigneeIds, setPriority, setQuery, clear } =
    useBoardFilters();
  const { data: users } = useUsers();

  const assigneeObjects = filters.assigneeIds
    .map((id) => users?.get(id))
    .filter((u): u is NonNullable<typeof u> => !!u)
    .map((u) => ({
      userId: u.id,
      name: u.name,
      assignedAt: new Date().toISOString(),
    }));

  const hasFilters =
    filters.assigneeIds.length > 0 ||
    filters.priority !== null ||
    filters.q.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={filters.q}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("filters.search")}
        className="h-8 w-48 text-sm"
      />
      <Select
        value={filters.priority ?? "_all"}
        onValueChange={(v) =>
          setPriority(v === "_all" ? null : (v as TaskPriority))
        }
      >
        <SelectTrigger className="h-8 w-36 text-sm">
          {/* Explicit children required: Radix SelectValue only resolves the
              selected item's text after mount, leaving the trigger blank during
              SSR. */}
          <SelectValue placeholder={t("filters.priority")}>
            {filters.priority
              ? t(`priority.${filters.priority}`)
              : t("filters.all")}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">{t("filters.all")}</SelectItem>
          {TASK_PRIORITIES.map((p) => (
            <SelectItem key={p} value={p}>
              {t(`priority.${p}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <AssigneePicker
        assignees={assigneeObjects}
        onAdd={(id) => setAssigneeIds([...filters.assigneeIds, id])}
        onRemove={(id) =>
          setAssigneeIds(filters.assigneeIds.filter((x) => x !== id))
        }
        trigger={
          <Button variant="outline" size="sm" className="h-8">
            {t("filters.assignee")}
            {filters.assigneeIds.length > 0 && (
              <Badge variant="secondary" className="ml-2 h-4 px-1 text-[10px]">
                {filters.assigneeIds.length}
              </Badge>
            )}
          </Button>
        }
      />
      {hasFilters && (
        <Button variant="ghost" size="sm" className="h-8" onClick={clear}>
          <X className="mr-1 h-3 w-3" />
          {t("filters.clear")}
        </Button>
      )}
    </div>
  );
}
