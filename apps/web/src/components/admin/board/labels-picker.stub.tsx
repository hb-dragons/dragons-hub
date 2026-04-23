"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@dragons/ui/components/button";
import { Tag } from "lucide-react";

/** Stub: opens a "coming soon" toast. Enablement: replace with popover picker
 *  calling /admin/boards/:id/labels. */
export function LabelsPickerButton() {
  const t = useTranslations("board");
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => toast.message(t("actions.comingSoon"))}
      className="w-full justify-start"
    >
      <Tag className="mr-2 h-4 w-4" />
      {t("actions.labels")}
    </Button>
  );
}
