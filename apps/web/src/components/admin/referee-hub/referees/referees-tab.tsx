"use client";

import { useTranslations } from "next-intl";
import { useRefereeHubUrl } from "../use-referee-hub-url";
import { RefereeList } from "./referee-list";
import { RefereeDetail } from "./referee-detail";

export function RefereesTab() {
  const t = useTranslations("refereeHub.referees");
  const { state, update } = useRefereeHubUrl();

  return (
    <div className="grid grid-cols-[minmax(320px,1fr)_2fr] gap-px bg-border/15 rounded-md overflow-hidden min-h-[600px]">
      <div className="bg-surface-low">
        <RefereeList
          selectedId={state.refereeId}
          onSelect={(id) => update({ refereeId: id })}
        />
      </div>
      <div className="bg-card">
        {state.refereeId !== null ? (
          <RefereeDetail refereeId={state.refereeId} />
        ) : (
          <div className="p-6 text-sm text-muted-foreground text-center">
            {t("selectPrompt")}
          </div>
        )}
      </div>
    </div>
  );
}
