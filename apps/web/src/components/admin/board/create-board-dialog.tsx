"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@dragons/ui/components/button";
import { Input } from "@dragons/ui/components/input";
import { Label } from "@dragons/ui/components/label";
import { Textarea } from "@dragons/ui/components/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@dragons/ui/components/dialog";
import { Loader2, Plus } from "lucide-react";
import { useBoardMutations } from "@/hooks/use-board-mutations";

export interface CreateBoardDialogProps {
  trigger?: React.ReactNode;
}

export function CreateBoardDialog({ trigger }: CreateBoardDialogProps) {
  const t = useTranslations();
  const router = useRouter();
  const { createBoard } = useBoardMutations();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const board = await createBoard({
        name: name.trim(),
        description: description.trim() || null,
      });
      toast.success(t("board.toast.created"));
      setOpen(false);
      setName("");
      setDescription("");
      router.push(`/admin/boards/${board.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            {t("board.addBoard")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t("board.addBoard")}</DialogTitle>
            <DialogDescription>{t("board.boardName")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="board-name">{t("board.boardName")}</Label>
            <Input
              id="board-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="board-description">
              {t("board.boardDescription")}
            </Label>
            <Textarea
              id="board-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!name.trim() || saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("board.createBoard")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
