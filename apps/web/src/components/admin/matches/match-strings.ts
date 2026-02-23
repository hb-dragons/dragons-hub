/**
 * UI string constants for match components.
 * Centralised here as a stepping stone toward i18n.
 */
export const matchStrings = {
  // Page
  pageTitle: "Spiele",

  // Table columns
  columnDate: "Datum",
  columnTime: "Uhrzeit",
  columnTeam: "Team",
  columnHome: "Heim",
  columnGuest: "Gast",
  columnScore: "Ergebnis",
  columnAnschreiber: "Anschreiber",
  columnZeitnehmer: "Zeitnehmer",
  columnShotclock: "Shotclock",
  columnComment: "Kommentar",

  // Table toolbar
  searchPlaceholder: "Spiele suchen...",
  dateFilter: "Datum",
  noResults: "Keine Spiele gefunden",

  // Sheet header
  matchDay: "Spieltag",

  // Sheet sections
  sectionMatchInfo: "Spielinfo",
  sectionOverrides: "Lokale Änderungen",
  sectionStaff: "Kampfgericht",
  sectionNotes: "Notizen",

  // Match info labels
  matchNo: "Spiel-Nr",
  league: "Liga",
  venue: "Halle",
  status: "Status",
  score: "Ergebnis",
  halftimeScore: "Halbzeit",
  confirmed: "Bestätigt",
  forfeited: "Verzicht",
  cancelled: "Abgesagt",
  lastSync: "Letzter Sync",
  remoteVersion: "Remote Version",

  // Override fields
  officialLabel: "Offiziell",
  localLabel: "Lokal",
  resetOverride: "Zurücksetzen",
  overrideTooltip: (official: string, local: string) =>
    `Offiziell: ${official} → Lokal: ${local}`,

  // Form
  venueOverride: "Hallenname",
  internalNotes: "Interne Notizen",
  internalNotesHint: "Nur für Admins sichtbar",
  publicComment: "Öffentlicher Kommentar",
  publicCommentHint: "Auf öffentlichen Seiten sichtbar",
  changeReason: "Änderungsgrund",
  changeReasonPlaceholder: "z.B. Per E-Mail verschoben",
  save: "Speichern",

  // Badges / status
  overrideCount: (n: number) => `${n} Override${n !== 1 ? "s" : ""}`,
  noStatusFlags: "Keine Statusflags gesetzt",
} as const;
