export const ADMIN_TZ = "Europe/Berlin";

const FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: ADMIN_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todayInBerlin(): string {
  return FMT.format(new Date());
}

export function plusDaysInBerlin(days: number): string {
  return FMT.format(new Date(Date.now() + days * 86400_000));
}
