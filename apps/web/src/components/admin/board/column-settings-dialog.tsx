"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useColumnMutations } from "@/hooks/use-column-mutations";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@dragons/ui/components/alert-dialog";
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
  const { addColumn, updateColumn, deleteColumn } = useColumnMutations(boardId);
  const isEditing = column !== null;

  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [isDoneColumn, setIsDoneColumn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

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
        await updateColumn(column.id, body);
      } else {
        await addColumn(body);
      }
      onOpenChange(false);
    } catch {
      // useColumnMutations already toasted the failure; keep the dialog open
      // so the user can retry or copy their input out.
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!column) return;
    setDeleting(true);
    try {
      await deleteColumn(column.id);
      setConfirmDeleteOpen(false);
      onOpenChange(false);
    } catch {
      // useColumnMutations already toasted the failure (the API refuses to
      // delete a column that still holds tasks); keep both dialogs open.
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
            <Label htmlFor="col-color">{t("board.column.colorHex")}</Label>
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
            <Label htmlFor="col-done">{t("board.column.doneColumn")}</Label>
          </div>
        </div>

        <DialogFooter>
          {isEditing && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setConfirmDeleteOpen(true)}
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
          <Button onClick={() => { void handleSave(); }} disabled={!name.trim() || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>

        <AlertDialog
          open={confirmDeleteOpen}
          onOpenChange={setConfirmDeleteOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("board.delete.columnTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("board.delete.columnBody")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>
                {t("board.delete.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={(e) => {
                  // Keep the confirmation open until the request settles so a
                  // failure stays visible next to the action that caused it.
                  e.preventDefault();
                  void handleDelete();
                }}
              >
                {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("board.delete.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
