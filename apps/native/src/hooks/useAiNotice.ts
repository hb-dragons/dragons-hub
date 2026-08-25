import { useCallback, useEffect, useState } from "react";
import {
  acknowledgeAiNotice,
  readAiNoticeAcknowledged,
  resolveNoticeState,
  type AiNoticeState,
} from "@/lib/assistant/ai-notice";

/** Loads the acknowledgement once; `acknowledge` flips it and persists. */
export function useAiNotice(): { state: AiNoticeState; acknowledge: () => void } {
  const [loaded, setLoaded] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    let active = true;
    void readAiNoticeAcknowledged().then((value) => {
      if (!active) return;
      setAcknowledged(value);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const acknowledge = useCallback(() => {
    setAcknowledged(true);
    void acknowledgeAiNotice();
  }, []);

  return { state: resolveNoticeState({ loaded, acknowledged }), acknowledge };
}
