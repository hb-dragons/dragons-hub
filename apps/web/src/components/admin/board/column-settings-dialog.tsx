"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useSWRConfig } from "swr";
import { fetchAPI } from "@/lib/api";
import { SWR_KEYS } from "@/lib/swr-keys";
import { Button } from "@dragons/ui/components/button";
import { Input } from "@dragons/ui/components/input";
import { Label } from "@dragons/ui/components/label";
import { Checkbox } from "@dragons/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dragons/ui/components/dialog";
import { Loader2, Trash2 } from "lucide-react";
import type { BoardColumnData } from "./types";

interface ColumnSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: number;
  column: BoardColumnData | null;
}

export function ColumnSettingsDialog({
  open,
  onOpenChange,
  boardId,
  column,
}: ColumnSettingsDialogProps) {
  const t = useTranslations();
  const { mutate } = useSWRConfig();
  const isEditing = column !== null;

  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [isDoneColumn, setIsDoneColumn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (column) {
      setName(column.name);
      setColor(column.color ?? "");
      setIsDoneColumn(column.isDoneColumn);
    } else {
      setName("");
      setColor("");
      setIsDoneColumn(false);
    }
  }, [column, open]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        color: color.trim() || null,
        isDoneColumn,
      };

      if (isEditing) {
        await fetchAPI(`/admin/boards/${boardId}/columns/${column.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
      } else {
        await fetchAPI(`/admin/boards/${boardId}/columns`, {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      await mutate(SWR_KEYS.boardDetail(boardId));
      onOpenChange(false);
    } catch {
      // Error surfaced by fetchAPI
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!column) return;
    setDeleting(true);
    try {
      await fetchAPI(`/admin/boards/${boardId}/columns/${column.id}`, {
        method: "DELETE",
      });
      await mutate(SWR_KEYS.boardDetail(boardId));
      await mutate(SWR_KEYS.boardTasks(boardId));
      onOpenChange(false);
    } catch {
      // Error surfaced by fetchAPI
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t("board.editColumn") : t("board.addColumn")}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? t("board.editColumn") : t("board.addColumn")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="col-name">{t("board.task.title")}</Label>
            <Input
              id="col-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="col-color">Color (hex)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="col-color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#6366f1"
                className="max-w-[200px]"
              />
              {color && (
                <span
                  className="inline-block h-6 w-6 rounded-full border"
                  style={{ backgroundColor: color }}
                />
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="col-done"
              checked={isDoneColumn}
              onCheckedChange={(checked) => setIsDoneColumn(checked === true)}
            />
            <Label htmlFor="col-done">Done column</Label>
          </div>
        </div>

        <DialogFooter>
          {isEditing && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
              className="mr-auto"
            >
              {deleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {t("board.deleteColumn")}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
