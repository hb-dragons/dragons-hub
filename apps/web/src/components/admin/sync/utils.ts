export function formatDuration(ms: number | null | undefined): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

type IntervalLabelTranslator = {
  (key: "sync.refereeSchedule.daily"): string;
  (
    key: "sync.refereeSchedule.everyNHours",
    values: { hours: number | string },
  ): string;
  (
    key: "sync.refereeSchedule.everyNMinutes",
    values: { minutes: number | string },
  ): string;
};

export function formatIntervalLabel(
  t: IntervalLabelTranslator,
  minutes: number,
): string {
  if (minutes >= 1440) return t("sync.refereeSchedule.daily");
  if (minutes >= 60 && minutes % 60 === 0) {
    return t("sync.refereeSchedule.everyNHours", { hours: minutes / 60 });
  }
  return t("sync.refereeSchedule.everyNMinutes", { minutes });
}
