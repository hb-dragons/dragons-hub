"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@dragons/ui/components/button";
import { Paperclip } from "lucide-react";

export function AttachmentsButton() {
  const t = useTranslations("board");
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => toast.message(t("actions.comingSoon"))}
      className="w-full justify-start"
    >
      <Paperclip className="mr-2 h-4 w-4" />
      {t("actions.attachments")}
    </Button>
  );
}
