"use client";

import { useTranslations } from "next-intl";
import { AssigneePicker } from "./assignee-picker";
import { LabelsPickerButton } from "./labels-picker.stub";
import { AttachmentsButton } from "./attachments-panel.stub";
import { WatchToggleButton } from "./watch-toggle.stub";
import { LinkPickerButton } from "./link-picker.stub";
import { ArchiveButton } from "./archive-button.stub";
import type { TaskAssignee } from "@dragons/shared";

export interface TaskDialogSidebarProps {
  assignees: TaskAssignee[];
  onAddAssignee: (userId: string) => Promise<void>;
  onRemoveAssignee: (userId: string) => Promise<void>;
}

export function TaskDialogSidebar({
  assignees,
  onAddAssignee,
  onRemoveAssignee,
}: TaskDialogSidebarProps) {
  const t = useTranslations("board");
  return (
    <aside className="w-full space-y-3 sm:w-48 shrink-0">
      <section className="space-y-1">
        <h4 className="text-[10px] font-semibold uppercase text-muted-foreground">
          {t("task.assignee")}
        </h4>
        <AssigneePicker
          assignees={assignees}
          onAdd={onAddAssignee}
          onRemove={onRemoveAssignee}
        />
      </section>
      <section className="space-y-1">
        <h4 className="text-[10px] font-semibold uppercase text-muted-foreground">
          {t("actions.labels")}
        </h4>
        <LabelsPickerButton />
      </section>
      <section className="space-y-1">
        <h4 className="text-[10px] font-semibold uppercase text-muted-foreground">
          {t("actions.attachments")}
        </h4>
        <AttachmentsButton />
        <LinkPickerButton />
      </section>
      <section className="space-y-1">
        <h4 className="text-[10px] font-semibold uppercase text-muted-foreground">
          {t("actions.watch")}
        </h4>
        <WatchToggleButton />
      </section>
      <section className="space-y-1 pt-2 border-t">
        <ArchiveButton />
      </section>
    </aside>
  );
}
