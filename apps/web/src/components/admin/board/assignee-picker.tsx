"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@dragons/ui/components/button";
import { Input } from "@dragons/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@dragons/ui/components/popover";
import { Check, Users } from "lucide-react";
import { useUsers } from "@/hooks/use-users";
import type { TaskAssignee } from "@dragons/shared";

export interface AssigneePickerProps {
  assignees: TaskAssignee[];
  onAdd: (userId: string) => Promise<void> | void;
  onRemove: (userId: string) => Promise<void> | void;
  trigger?: React.ReactNode;
  disabled?: boolean;
}

export function AssigneePicker({
  assignees,
  onAdd,
  onRemove,
  trigger,
  disabled,
}: AssigneePickerProps) {
  const t = useTranslations("board");
  const { data: users } = useUsers();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const assigned = useMemo(
    () => new Set(assignees.map((a) => a.userId)),
    [assignees],
  );

  const filtered = useMemo(() => {
    const list = users ? Array.from(users.values()) : [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (u) =>
        u.name.toLowerCase().includes(needle) ||
        u.email.toLowerCase().includes(needle),
    );
  }, [users, q]);

  async function toggle(userId: string) {
    if (assigned.has(userId)) {
      await onRemove(userId);
    } else {
      await onAdd(userId);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            disabled={disabled}
          >
            <Users className="mr-2 h-4 w-4" />
            {t("task.assignee")}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="border-b p-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("filters.search")}
            autoFocus
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <div className="p-3 text-center text-xs text-muted-foreground">
              {t("filters.noResults")}
            </div>
          ) : (
            filtered.map((u) => {
              const isAssigned = assigned.has(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggle(u.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <span className="h-5 w-5 rounded-full bg-muted inline-flex items-center justify-center text-[9px] font-semibold">
                    {u.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="flex-1">
                    <span className="block leading-tight">{u.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {u.email}
                    </span>
                  </span>
                  {isAssigned && <Check className="h-4 w-4 text-primary" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
