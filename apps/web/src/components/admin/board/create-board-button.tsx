"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { fetchAPI } from "@/lib/api";
import { Button } from "@dragons/ui/components/button";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

export function CreateBoardButton() {
  const t = useTranslations();
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    setCreating(true);
    try {
      await fetchAPI("/admin/boards", {
        method: "POST",
        body: JSON.stringify({
          name: "Club Operations",
        }),
      });
      toast.success(t("board.toast.created"));
      router.refresh();
    } catch {
      toast.error(t("common.failed"));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Button onClick={handleCreate} disabled={creating}>
      {creating ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Plus className="mr-2 h-4 w-4" />
      )}
      {t("board.createBoard")}
    </Button>
  );
}
