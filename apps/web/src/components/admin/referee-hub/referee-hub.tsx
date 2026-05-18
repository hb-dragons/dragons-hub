"use client";

import { useRefereeHubUrl } from "./use-referee-hub-url";
import { HubHeader } from "./hub-header";
import { OpenSlotsTab } from "./open-slots/open-slots-tab";
import { RefereesTab } from "./referees/referees-tab";

export function RefereeHubPage() {
  const { state } = useRefereeHubUrl();
  return (
    <div className="space-y-2">
      <HubHeader />
      {state.tab === "open-slots" ? <OpenSlotsTab /> : <RefereesTab />}
    </div>
  );
}
