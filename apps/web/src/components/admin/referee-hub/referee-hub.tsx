"use client";

import { useRefereeHubUrl } from "./use-referee-hub-url";
import { HubHeader } from "./hub-header";
import { OpenSlotsPrototype } from "./open-slots/prototype";
import { RefereesTab } from "./referees/referees-tab";

export function RefereeHubPage() {
  const { state } = useRefereeHubUrl();
  return (
    <div className="space-y-6">
      <HubHeader />
      {state.tab === "open-slots" ? <OpenSlotsPrototype /> : <RefereesTab />}
    </div>
  );
}
