"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
import { Button } from "@dragons/ui/components/button";
import { Archive, Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: string;
  onConfirm: () => Promise<void>;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  onConfirm,
}: DeleteConfirmDialogProps) {
  const t = useTranslations("board");
  const [running, setRunning] = useState(false);

  async function handleConfirm() {
    setRunning(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setRunning(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => toast.message(t("actions.archiveSoon"))}
            disabled
            className="mr-auto"
            title={t("actions.archiveSoon")}
          >
            <Archive className="mr-2 h-4 w-4" />
            {t("actions.archive")}
          </Button>
          <div className="flex gap-2">
            <AlertDialogCancel>{t("delete.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={running}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("delete.confirm")}
            </AlertDialogAction>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
