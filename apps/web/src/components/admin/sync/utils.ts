export function formatDuration(ms: number | null | undefined): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

type Translator = (key: string, values?: Record<string, unknown>) => string;

export function formatIntervalLabel(t: Translator, minutes: number): string {
  if (minutes >= 1440) return t("sync.refereeSchedule.daily");
  if (minutes >= 60 && minutes % 60 === 0) {
    return t("sync.refereeSchedule.everyNHours", { hours: minutes / 60 });
  }
  return t("sync.refereeSchedule.everyNMinutes", { minutes });
}
