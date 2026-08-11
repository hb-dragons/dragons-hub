"use client";

import { useTranslations } from "next-intl";
import { useRefereeHubUrl } from "../use-referee-hub-url";
import { RefereeList } from "./referee-list";
import { RefereeDetail } from "./referee-detail";

export function RefereesTab() {
  const t = useTranslations("refereeHub.referees");
  const { state, update } = useRefereeHubUrl();

  // List over detail on narrow screens; side-by-side from md up.
  return (
    <div className="bg-border/15 grid min-h-[600px] grid-cols-1 gap-px overflow-hidden rounded-md md:grid-cols-[minmax(320px,1fr)_2fr]">
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
