"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@dragons/ui/components/checkbox";
import { Button } from "@dragons/ui/components/button";
import { Input } from "@dragons/ui/components/input";
import { Plus, Trash2 } from "lucide-react";
import type { ChecklistItem } from "@dragons/shared";

export interface ChecklistEditorProps {
  items: ChecklistItem[];
  onToggle: (itemId: number, isChecked: boolean) => Promise<void> | void;
  onAdd: (label: string) => Promise<void> | void;
  onDelete: (itemId: number) => Promise<void> | void;
}

export function ChecklistEditor({
  items,
  onToggle,
  onAdd,
  onDelete,
}: ChecklistEditorProps) {
  const t = useTranslations("board");
  const [draft, setDraft] = useState("");
  const sorted = [...items].sort((a, b) => a.position - b.position);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    await onAdd(draft.trim());
    setDraft("");
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        {sorted.map((item) => (
          <div
            key={item.id}
            className="group flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/50"
          >
            <Checkbox
              checked={item.isChecked}
              onCheckedChange={(checked) =>
                onToggle(item.id, checked === true)
              }
            />
            <span
              className={
                item.isChecked
                  ? "flex-1 text-sm text-muted-foreground line-through"
                  : "flex-1 text-sm"
              }
            >
              {item.label}
            </span>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => onDelete(item.id)}
              className="opacity-0 group-hover:opacity-100"
              aria-label={t("delete.confirm")}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("task.checklist")}
          className="h-8 text-sm"
        />
        <Button type="submit" size="sm" disabled={!draft.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
