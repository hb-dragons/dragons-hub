"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@dragons/ui/components/button";
import { Link2 } from "lucide-react";

export function LinkPickerButton() {
  const t = useTranslations("board");
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => toast.message(t("actions.comingSoon"))}
      className="w-full justify-start"
    >
      <Link2 className="mr-2 h-4 w-4" />
      {t("actions.link")}
    </Button>
  );
}
