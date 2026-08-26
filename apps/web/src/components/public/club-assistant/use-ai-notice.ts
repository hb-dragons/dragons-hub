"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import {
  acknowledgeAiNotice,
  readAiNoticeAcknowledged,
  resolveNoticeState,
  type AiNoticeState,
} from "./ai-notice";

// localStorage as an external store: the server snapshot is `null` (pending),
// so hydration never disagrees with the stored flag, and the `storage` event
// carries an acknowledgement made in another tab into this one.
function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function getServerSnapshot(): boolean | null {
  return null;
}

/** Reads the acknowledgement from storage; `acknowledge` flips it and persists. */
export function useAiNotice(): { state: AiNoticeState; acknowledge: () => void } {
  const stored = useSyncExternalStore(subscribe, readAiNoticeAcknowledged, getServerSnapshot);
  // Kept alongside the stored flag so a storage that rejects the write still
  // hides the notice for this session.
  const [sessionAcknowledged, setSessionAcknowledged] = useState(false);

  const acknowledge = useCallback(() => {
    setSessionAcknowledged(true);
    acknowledgeAiNotice();
  }, []);

  return {
    state: resolveNoticeState({
      loaded: stored !== null,
      acknowledged: stored === true || sessionAcknowledged,
    }),
    acknowledge,
  };
}
