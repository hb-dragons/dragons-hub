"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@dragons/ui/components/button";
import { Archive } from "lucide-react";

export function ArchiveButton() {
  const t = useTranslations("board");
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => toast.message(t("actions.archiveSoon"))}
      className="w-full justify-start"
    >
      <Archive className="mr-2 h-4 w-4" />
      {t("actions.archive")}
    </Button>
  );
}
