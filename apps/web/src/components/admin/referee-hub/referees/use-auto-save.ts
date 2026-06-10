"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutoSaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

interface Options {
  save: () => Promise<void>;
  debounceMs?: number;
}

export function useAutoSave({ save, debounceMs = 800 }: Options) {
  const [status, setStatus] = useState<AutoSaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aliveRef = useRef(true);
  const saveRef = useRef(save);

  useEffect(() => { saveRef.current = save; }, [save]);

  useEffect(() => () => {
    aliveRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const runSave = useCallback(async () => {
    if (!aliveRef.current) return;
    setStatus("saving");
    try {
      await saveRef.current();
      if (!aliveRef.current) return;
      setStatus("saved");
      setLastSavedAt(Date.now());
    } catch {
      if (!aliveRef.current) return;
      setStatus("error");
    }
  }, []);

  const markDirty = useCallback(() => {
    if (!aliveRef.current) return;
    setStatus("dirty");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(runSave, debounceMs);
  }, [debounceMs, runSave]);

  const saveNow = useCallback(async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    await runSave();
  }, [runSave]);

  return { status, lastSavedAt, markDirty, saveNow };
}
