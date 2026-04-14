import type { RefereeSlotsPayload } from "@dragons/shared";

/**
 * Format a YYYY-MM-DD date string as DD.MM.YYYY.
 */
function formatDateFull(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${day}.${month}.${year}`;
}

/**
 * Format a date string to a short German weekday (Mo, Di, Mi, Do, Fr, Sa, So).
 */
function weekdayShort(dateStr: string): string {
  const days = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const d = new Date(dateStr + "T12:00:00");
  return days[d.getDay()]!;
}

function renderSlotLine(slotNum: number, isOpen: boolean, assigned: string | null, isReminder: boolean): string {
  if (!isOpen && assigned) {
    return `SR${slotNum}: ✅ ${assigned}`;
  }
  return isReminder ? `SR${slotNum}: ❌ *offen*` : `SR${slotNum}: ❌ offen`;
}

function renderCountdown(days: number): string {
  if (days === 1) return "Spieltag morgen!";
  return `Spieltag in ${days} Tagen!`;
}

/**
 * Render a WhatsApp-formatted message for referee slot notifications.
 * Pure function: payload in, string out.
 */
export function renderRefereeSlotsWhatsApp(
  payload: RefereeSlotsPayload,
  baseUrl: string,
): string {
  const isReminder = payload.reminderLevel != null;
  const bothOpen = payload.sr1Open && payload.sr2Open;
  const oneOpen = (payload.sr1Open || payload.sr2Open) && !bothOpen;

  // Title
  let title: string;
  if (isReminder) {
    title = oneOpen
      ? "⚠️ *Noch ein Schiedsrichter benötigt!*"
      : "⚠️ *Noch Schiedsrichter benötigt!*";
  } else {
    title = "🏀 *Schiedsrichter gesucht!*";
  }

  // Match info
  const wd = weekdayShort(payload.kickoffDate);
  const dateFmt = formatDateFull(payload.kickoffDate);
  const lines = [
    title,
    "",
    `${payload.homeTeam} vs. ${payload.guestTeam}`,
    `📅 ${wd}, ${dateFmt} um ${payload.kickoffTime}`,
    `📍 ${payload.venueName ?? "Ort unbekannt"}`,
  ];

  // League name only on initial notification
  if (!isReminder) {
    lines.push(`🏟️ ${payload.leagueName}`);
  }

  lines.push("");

  // Slot lines — always show both SR1 and SR2 since own-club home games need both
  lines.push(renderSlotLine(1, payload.sr1Open, payload.sr1Assigned, isReminder));
  lines.push(renderSlotLine(2, payload.sr2Open, payload.sr2Assigned, isReminder));

  // Countdown for reminders
  if (isReminder && payload.reminderLevel != null) {
    lines.push("");
    lines.push(renderCountdown(payload.reminderLevel));
  }

  // Deep link
  lines.push(`👉 ${isReminder ? "" : "Spiel übernehmen: "}${baseUrl}${payload.deepLink}`);

  return lines.join("\n");
}
