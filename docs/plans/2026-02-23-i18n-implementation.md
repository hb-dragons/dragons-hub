# i18n Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add German + English internationalization to the Dragons admin UI using next-intl v4, with URL subpath routing (`as-needed` prefix), unified date/time formatting, and a locale switcher.

**Architecture:** Install next-intl, wrap the App Router under a `[locale]` dynamic segment, extract ~195 hardcoded strings into `de.json`/`en.json` message files, replace all `next/link` and `next/navigation` imports with locale-aware equivalents, unify date formatting through next-intl's formatter, and add a DE/EN toggle to the admin header.

**Tech Stack:** next-intl v4.x, Next.js 16.1 App Router, TypeScript, React 19, Vitest

---

### Task 1: Install next-intl and configure the plugin

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/next.config.ts`

**Step 1: Install next-intl**

Run: `pnpm --filter @dragons/web add next-intl`

**Step 2: Wrap next.config.ts with the next-intl plugin**

Replace the full contents of `apps/web/next.config.ts` with:

```ts
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  transpilePackages: ["@dragons/ui"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
```

**Step 3: Commit**

```bash
git add apps/web/package.json apps/web/next.config.ts pnpm-lock.yaml
git commit -m "feat(web): install next-intl and configure plugin"
```

---

### Task 2: Create i18n routing and request configuration

**Files:**
- Create: `apps/web/src/i18n/routing.ts`
- Create: `apps/web/src/i18n/request.ts`

**Step 1: Create routing config**

Create `apps/web/src/i18n/routing.ts`:

```ts
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["de", "en"],
  defaultLocale: "de",
  localePrefix: "as-needed",
});
```

**Step 2: Create request config**

Create `apps/web/src/i18n/request.ts`:

```ts
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !routing.locales.includes(locale as "de" | "en")) {
    locale = routing.defaultLocale;
  }
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    formats: {
      dateTime: {
        matchDate: {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
        },
        short: {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        },
        syncTimestamp: {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        },
      },
    },
  };
});
```

**Step 3: Commit**

```bash
git add apps/web/src/i18n/
git commit -m "feat(web): add i18n routing and request configuration"
```

---

### Task 3: Create German and English message files

**Files:**
- Create: `apps/web/src/messages/de.json`
- Create: `apps/web/src/messages/en.json`

**Step 1: Create German messages**

Create `apps/web/src/messages/de.json` with ALL extracted strings. Use the following key convention: `section.component.element`. This file is the source of truth for TypeScript types.

```json
{
  "metadata.title": "Dragons Admin",
  "metadata.description": "Verwaltung des Basketball-Vereins",

  "nav.brand": "Dragons Admin",
  "nav.matches": "Spiele",
  "nav.teams": "Teams",
  "nav.sync": "Synchronisation",
  "nav.settings": "Einstellungen",

  "common.save": "Speichern",
  "common.saving": "Speichere...",
  "common.saved": "Gespeichert",
  "common.failed": "Fehlgeschlagen",
  "common.saveChanges": "Speichern",
  "common.cancel": "Abbrechen",
  "common.back": "Zurück",
  "common.loading": "Laden...",
  "common.noResults": "Keine Ergebnisse.",
  "common.reset": "Zurücksetzen",
  "common.clear": "Löschen",
  "common.clearFilters": "Filter löschen",
  "common.loadMore": "Mehr laden",
  "common.columns": "Spalten",
  "common.columnsToggle": "Spalten ein/ausblenden",
  "common.selected": "{count} gewählt",
  "common.resetFilter": "Filter zurücksetzen",
  "common.search": "Suchen...",
  "common.remote": "Remote: {value}",
  "common.release": "Freigeben",
  "common.unsavedChanges": "Ungespeicherte Änderungen",

  "matches.title": "Spiele",
  "matches.description": "Spiele des eigenen Vereins anzeigen und verwalten",
  "matches.cardTitle": "Spiele",
  "matches.cardDescription": "Alle Spiele des eigenen Vereins",
  "matches.empty": "Keine Spiele gefunden",
  "matches.searchPlaceholder": "Spiele suchen...",
  "matches.columns.date": "Datum",
  "matches.columns.time": "Uhrzeit",
  "matches.columns.team": "Team",
  "matches.columns.home": "Heim",
  "matches.columns.guest": "Gast",
  "matches.columns.score": "Ergebnis",
  "matches.columns.anschreiber": "Anschreiber",
  "matches.columns.zeitnehmer": "Zeitnehmer",
  "matches.columns.shotclock": "Shotclock",
  "matches.columns.comment": "Kommentar",

  "matchDetail.matchday": "Spieltag {day}",
  "matchDetail.matchdayBadge": "ST {day}",
  "matchDetail.overrideCount": "{count, plural, =1 {# Override} other {# Overrides}}",
  "matchDetail.info.title": "Spielinfo",
  "matchDetail.info.matchNo": "Spielnr.",
  "matchDetail.info.matchday": "Spieltag",
  "matchDetail.info.league": "Liga",
  "matchDetail.info.date": "Datum",
  "matchDetail.info.time": "Uhrzeit",
  "matchDetail.info.venue": "Halle",
  "matchDetail.score.title": "Ergebnis",
  "matchDetail.score.final": "Endstand",
  "matchDetail.score.halftime": "Halbzeit",
  "matchDetail.status.title": "Status",
  "matchDetail.status.confirmed": "Bestätigt",
  "matchDetail.status.forfeited": "Kampflos",
  "matchDetail.status.cancelled": "Abgesagt",
  "matchDetail.status.noFlags": "Keine Statusflags gesetzt",
  "matchDetail.status.lastSync": "Letzte Synchronisation: {value}",
  "matchDetail.status.remoteVersion": "Remote-Version: v{version}",
  "matchDetail.overrides.title": "Überschreibungen",
  "matchDetail.overrides.date": "Datum",
  "matchDetail.overrides.time": "Uhrzeit",
  "matchDetail.overrides.venue": "Halle",
  "matchDetail.overrides.forfeited": "Kampflos",
  "matchDetail.overrides.cancelled": "Abgesagt",
  "matchDetail.staff.title": "Kampfgericht",
  "matchDetail.staff.anschreiber": "Anschreiber",
  "matchDetail.staff.zeitnehmer": "Zeitnehmer",
  "matchDetail.staff.shotclock": "Shotclock",
  "matchDetail.staff.placeholder": "Teamname",
  "matchDetail.notes.title": "Notizen",
  "matchDetail.notes.internal": "Interne Notizen",
  "matchDetail.notes.internalDescription": "Nur für Admins sichtbar",
  "matchDetail.notes.internalPlaceholder": "Interne Notizen",
  "matchDetail.notes.public": "Öffentlicher Kommentar",
  "matchDetail.notes.publicDescription": "Auf öffentlichen Seiten sichtbar",
  "matchDetail.notes.publicPlaceholder": "Öffentlicher Kommentar",
  "matchDetail.changeReason.label": "Änderungsgrund",
  "matchDetail.changeReason.description": "Optionale Notiz zu dieser Änderung",
  "matchDetail.changeReason.placeholder": "z.B. Per E-Mail verschoben",
  "matchDetail.toast.updated": "Spiel aktualisiert",
  "matchDetail.toast.updateFailed": "Aktualisierung fehlgeschlagen",
  "matchDetail.toast.overrideReleased": "Override freigegeben",
  "matchDetail.toast.overrideReleaseFailed": "Override-Freigabe fehlgeschlagen",
  "matchDetail.diff.diverged": "Abweichend",
  "matchDetail.diff.synced": "Synchron",
  "matchDetail.diff.local": "Lokal",

  "sync.title": "Synchronisation",
  "sync.description": "Datensynchronisation überwachen und steuern",
  "sync.trigger": "Sync starten",
  "sync.tabs.history": "Sync-Verlauf",
  "sync.tabs.schedule": "Zeitplan-Einstellungen",
  "sync.status.current": "Aktueller Status",
  "sync.status.lastSync": "Letzte Synchronisation",
  "sync.status.nextSync": "Nächste Synchronisation",
  "sync.status.schedule": "Zeitplan",
  "sync.status.running": "Läuft",
  "sync.status.idle": "Bereit",
  "sync.status.success": "Erfolgreich",
  "sync.status.failed": "Fehlgeschlagen",
  "sync.status.never": "Nie",
  "sync.status.enabled": "Aktiviert",
  "sync.status.disabled": "Deaktiviert",
  "sync.status.type": "Typ: {type}",
  "sync.status.tomorrow": "morgen",
  "sync.status.inMinutes": "in {minutes}m",
  "sync.status.inHours": "in {hours}h {minutes}m",
  "sync.history.title": "Sync-Verlauf",
  "sync.history.description": "Bisherige Sync-Läufe und deren Ergebnisse",
  "sync.history.empty": "Noch keine Sync-Läufe",
  "sync.history.columns.status": "Status",
  "sync.history.columns.type": "Typ",
  "sync.history.columns.started": "Gestartet",
  "sync.history.columns.duration": "Dauer",
  "sync.history.columns.records": "Datensätze",
  "sync.history.columns.trigger": "Auslöser",
  "sync.history.recordsTooltip": "Erstellt / Aktualisiert / Übersprungen / Fehlgeschlagen",
  "sync.history.status.completed": "Abgeschlossen",
  "sync.history.status.failed": "Fehlgeschlagen",
  "sync.history.status.running": "Läuft",
  "sync.history.status.pending": "Ausstehend",
  "sync.schedule.title": "Zeitplan-Einstellungen",
  "sync.schedule.description": "Automatischen Sync-Zeitplan konfigurieren",
  "sync.schedule.enabledLabel": "Automatische Synchronisation",
  "sync.schedule.enabledDescription": "Sync automatisch nach täglichem Zeitplan ausführen",
  "sync.schedule.timeLabel": "Sync-Uhrzeit",
  "sync.schedule.timezoneLabel": "Zeitzone",
  "sync.schedule.cronFormat": "Täglich um {hour}:00",
  "sync.schedule.toast.updated": "Zeitplan aktualisiert",
  "sync.schedule.toast.updateFailed": "Zeitplan konnte nicht gespeichert werden",
  "sync.live.title": "Live Sync-Fortschritt",
  "sync.live.connected": "Verbunden",
  "sync.live.disconnected": "Getrennt",
  "sync.live.streaming": "Sync-Einträge in Echtzeit",
  "sync.live.created": "{count} erstellt",
  "sync.live.updated": "{count} aktualisiert",
  "sync.live.skipped": "{count} übersprungen",
  "sync.live.failed": "{count} fehlgeschlagen",
  "sync.live.waiting": "Warte auf Einträge...",
  "sync.live.starting": "Starte Sync...",
  "sync.live.preparing": "Sync-Job wird vorbereitet...",
  "sync.logDetail.showStack": "Stack-Trace anzeigen",
  "sync.logDetail.hideStack": "Stack-Trace ausblenden",
  "sync.logDetail.allEntities": "Alle Entitäten",
  "sync.logDetail.allActions": "Alle Aktionen",
  "sync.logDetail.entries": "{count, plural, =1 {# Eintrag} other {# Einträge}}",
  "sync.logDetail.loadingEntries": "Lade Einträge...",
  "sync.logDetail.noMatchingEntries": "Keine Einträge für die gewählten Filter",
  "sync.logDetail.noEntries": "Keine Einträge gefunden",
  "sync.logDetail.loadMore": "Mehr laden ({remaining} verbleibend)",
  "sync.logDetail.loadFailed": "Einträge konnten nicht geladen werden",
  "sync.logDetail.entity.league": "Liga",
  "sync.logDetail.entity.match": "Spiel",
  "sync.logDetail.entity.team": "Team",
  "sync.logDetail.entity.standing": "Tabelle",
  "sync.logDetail.entity.venue": "Halle",
  "sync.logDetail.entity.referee": "Schiedsrichter",
  "sync.logDetail.entity.refereeRole": "Schiedsrichter-Rolle",
  "sync.logDetail.action.created": "Erstellt",
  "sync.logDetail.action.updated": "Aktualisiert",
  "sync.logDetail.action.skipped": "Übersprungen",
  "sync.logDetail.action.failed": "Fehlgeschlagen",
  "sync.toast.triggerFailed": "Sync konnte nicht gestartet werden",
  "sync.toast.connectionLost": "Verbindung zur API verloren",
  "sync.toast.connectionLostDescription": "Daten können veraltet sein. Wiederverbindung im Hintergrund.",
  "sync.toast.loadMoreFailed": "Weitere Logs konnten nicht geladen werden",

  "teams.title": "Teams",
  "teams.description": "Eigene Teamnamen zuweisen",
  "teams.empty": "Keine eigenen Teams gefunden.",
  "teams.columns.apiName": "API-Name",
  "teams.columns.league": "Liga",
  "teams.columns.customName": "Eigener Name",
  "teams.placeholder": "Eigenen Namen eingeben...",

  "settings.title": "Einstellungen",
  "settings.description": "Verein konfigurieren und Liga-Tracking verwalten",
  "settings.club.title": "Vereinskonfiguration",
  "settings.club.description": "Vereins-ID von basketball-bund.net festlegen. Damit wird bestimmt, welche Ligen gefunden werden können.",
  "settings.club.idLabel": "Vereins-ID",
  "settings.club.idPlaceholder": "z.B. 4121",
  "settings.club.nameLabel": "Vereinsname",
  "settings.club.namePlaceholder": "z.B. Dragons Rhöndorf",
  "settings.club.idCurrent": "ID: {id}",
  "settings.club.toast.invalidId": "Vereins-ID muss eine positive Zahl sein",
  "settings.club.toast.nameRequired": "Vereinsname ist erforderlich",
  "settings.club.toast.saved": "Verein auf {name} gesetzt",
  "settings.club.toast.saveFailed": "Vereinskonfiguration konnte nicht gespeichert werden",
  "settings.leagues.title": "Verfolgte Ligen",
  "settings.leagues.description": "Liganummern (liganr) eingeben, die synchronisiert werden sollen, getrennt durch Kommas.",
  "settings.leagues.numbersLabel": "Liganummern",
  "settings.leagues.numbersPlaceholder": "z.B. 4102, 4105, 4003",
  "settings.leagues.configureClubFirst": "Bitte zuerst oben einen Verein konfigurieren.",
  "settings.leagues.notFound": "Nicht gefunden: {numbers}",
  "settings.leagues.columns.ligaNr": "Liga Nr",
  "settings.leagues.columns.name": "Name",
  "settings.leagues.columns.season": "Saison",
  "settings.leagues.toast.partial": "{tracked} Liga(s) gespeichert. {notFoundCount} nicht gefunden: {notFoundList}",
  "settings.leagues.toast.saved": "{count} Liga(s) werden verfolgt",
  "settings.leagues.toast.saveFailed": "Liga-Einstellungen konnten nicht gespeichert werden",

  "time.justNow": "gerade eben",
  "time.minutesAgo": "vor {minutes}m",
  "time.hoursAgo": "vor {hours}h",
  "time.yesterday": "gestern",
  "time.daysAgo": "vor {days}d",

  "locale.switch": "Sprache",
  "locale.de": "Deutsch",
  "locale.en": "English"
}
```

**Step 2: Create English messages**

Create `apps/web/src/messages/en.json` with translated values for all the same keys:

```json
{
  "metadata.title": "Dragons Admin",
  "metadata.description": "Basketball club management",

  "nav.brand": "Dragons Admin",
  "nav.matches": "Matches",
  "nav.teams": "Teams",
  "nav.sync": "Sync",
  "nav.settings": "Settings",

  "common.save": "Save",
  "common.saving": "Saving...",
  "common.saved": "Saved",
  "common.failed": "Failed",
  "common.saveChanges": "Save Changes",
  "common.cancel": "Cancel",
  "common.back": "Back",
  "common.loading": "Loading...",
  "common.noResults": "No results.",
  "common.reset": "Reset",
  "common.clear": "Clear",
  "common.clearFilters": "Clear filters",
  "common.loadMore": "Load More",
  "common.columns": "Columns",
  "common.columnsToggle": "Toggle columns",
  "common.selected": "{count} selected",
  "common.resetFilter": "Reset filter",
  "common.search": "Search...",
  "common.remote": "Remote: {value}",
  "common.release": "Release",
  "common.unsavedChanges": "Unsaved changes",

  "matches.title": "Matches",
  "matches.description": "View and manage your club's matches",
  "matches.cardTitle": "Matches",
  "matches.cardDescription": "All matches for your club",
  "matches.empty": "No matches found",
  "matches.searchPlaceholder": "Search matches...",
  "matches.columns.date": "Date",
  "matches.columns.time": "Time",
  "matches.columns.team": "Team",
  "matches.columns.home": "Home",
  "matches.columns.guest": "Guest",
  "matches.columns.score": "Score",
  "matches.columns.anschreiber": "Scorer",
  "matches.columns.zeitnehmer": "Timekeeper",
  "matches.columns.shotclock": "Shot Clock",
  "matches.columns.comment": "Comment",

  "matchDetail.matchday": "Matchday {day}",
  "matchDetail.matchdayBadge": "MD {day}",
  "matchDetail.overrideCount": "{count, plural, =1 {# Override} other {# Overrides}}",
  "matchDetail.info.title": "Match Info",
  "matchDetail.info.matchNo": "Match No",
  "matchDetail.info.matchday": "Matchday",
  "matchDetail.info.league": "League",
  "matchDetail.info.date": "Date",
  "matchDetail.info.time": "Time",
  "matchDetail.info.venue": "Venue",
  "matchDetail.score.title": "Score",
  "matchDetail.score.final": "Final",
  "matchDetail.score.halftime": "Halftime",
  "matchDetail.status.title": "Status",
  "matchDetail.status.confirmed": "Confirmed",
  "matchDetail.status.forfeited": "Forfeited",
  "matchDetail.status.cancelled": "Cancelled",
  "matchDetail.status.noFlags": "No status flags set",
  "matchDetail.status.lastSync": "Last sync: {value}",
  "matchDetail.status.remoteVersion": "Remote version: v{version}",
  "matchDetail.overrides.title": "Overrides",
  "matchDetail.overrides.date": "Date",
  "matchDetail.overrides.time": "Time",
  "matchDetail.overrides.venue": "Venue",
  "matchDetail.overrides.forfeited": "Forfeited",
  "matchDetail.overrides.cancelled": "Cancelled",
  "matchDetail.staff.title": "Officials",
  "matchDetail.staff.anschreiber": "Scorer",
  "matchDetail.staff.zeitnehmer": "Timekeeper",
  "matchDetail.staff.shotclock": "Shot Clock",
  "matchDetail.staff.placeholder": "Team name",
  "matchDetail.notes.title": "Notes",
  "matchDetail.notes.internal": "Internal Notes",
  "matchDetail.notes.internalDescription": "Only visible to admins",
  "matchDetail.notes.internalPlaceholder": "Internal notes",
  "matchDetail.notes.public": "Public Comment",
  "matchDetail.notes.publicDescription": "Visible on public pages",
  "matchDetail.notes.publicPlaceholder": "Public comment",
  "matchDetail.changeReason.label": "Change Reason",
  "matchDetail.changeReason.description": "Optional note explaining this change",
  "matchDetail.changeReason.placeholder": "e.g. Rescheduled by email",
  "matchDetail.toast.updated": "Match updated",
  "matchDetail.toast.updateFailed": "Failed to update match",
  "matchDetail.toast.overrideReleased": "Override released",
  "matchDetail.toast.overrideReleaseFailed": "Failed to release override",
  "matchDetail.diff.diverged": "Diverged",
  "matchDetail.diff.synced": "Synced",
  "matchDetail.diff.local": "Local",

  "sync.title": "Sync Management",
  "sync.description": "Monitor and control data synchronization",
  "sync.trigger": "Start Sync",
  "sync.tabs.history": "Sync History",
  "sync.tabs.schedule": "Schedule Settings",
  "sync.status.current": "Current Status",
  "sync.status.lastSync": "Last Sync",
  "sync.status.nextSync": "Next Sync",
  "sync.status.schedule": "Schedule",
  "sync.status.running": "Running",
  "sync.status.idle": "Idle",
  "sync.status.success": "Success",
  "sync.status.failed": "Failed",
  "sync.status.never": "Never",
  "sync.status.enabled": "Enabled",
  "sync.status.disabled": "Disabled",
  "sync.status.type": "Type: {type}",
  "sync.status.tomorrow": "tomorrow",
  "sync.status.inMinutes": "in {minutes}m",
  "sync.status.inHours": "in {hours}h {minutes}m",
  "sync.history.title": "Sync History",
  "sync.history.description": "Previous sync runs and their results",
  "sync.history.empty": "No sync runs yet",
  "sync.history.columns.status": "Status",
  "sync.history.columns.type": "Type",
  "sync.history.columns.started": "Started",
  "sync.history.columns.duration": "Duration",
  "sync.history.columns.records": "Records",
  "sync.history.columns.trigger": "Trigger",
  "sync.history.recordsTooltip": "Created / Updated / Skipped / Failed",
  "sync.history.status.completed": "Completed",
  "sync.history.status.failed": "Failed",
  "sync.history.status.running": "Running",
  "sync.history.status.pending": "Pending",
  "sync.schedule.title": "Schedule Settings",
  "sync.schedule.description": "Configure the automatic sync schedule",
  "sync.schedule.enabledLabel": "Automatic Sync",
  "sync.schedule.enabledDescription": "Run sync automatically on a daily schedule",
  "sync.schedule.timeLabel": "Sync Time",
  "sync.schedule.timezoneLabel": "Timezone",
  "sync.schedule.cronFormat": "Daily at {hour}:00",
  "sync.schedule.toast.updated": "Schedule updated",
  "sync.schedule.toast.updateFailed": "Failed to save schedule",
  "sync.live.title": "Live Sync Progress",
  "sync.live.connected": "Connected",
  "sync.live.disconnected": "Disconnected",
  "sync.live.streaming": "Streaming sync entries in real-time",
  "sync.live.created": "{count} created",
  "sync.live.updated": "{count} updated",
  "sync.live.skipped": "{count} skipped",
  "sync.live.failed": "{count} failed",
  "sync.live.waiting": "Waiting for entries...",
  "sync.live.starting": "Starting sync...",
  "sync.live.preparing": "Preparing sync job...",
  "sync.logDetail.showStack": "Show stack trace",
  "sync.logDetail.hideStack": "Hide stack trace",
  "sync.logDetail.allEntities": "All Entities",
  "sync.logDetail.allActions": "All Actions",
  "sync.logDetail.entries": "{count, plural, =1 {# entry} other {# entries}}",
  "sync.logDetail.loadingEntries": "Loading entries...",
  "sync.logDetail.noMatchingEntries": "No entries match the selected filters",
  "sync.logDetail.noEntries": "No entries found",
  "sync.logDetail.loadMore": "Load more ({remaining} remaining)",
  "sync.logDetail.loadFailed": "Failed to load sync entries",
  "sync.logDetail.entity.league": "League",
  "sync.logDetail.entity.match": "Match",
  "sync.logDetail.entity.team": "Team",
  "sync.logDetail.entity.standing": "Standing",
  "sync.logDetail.entity.venue": "Venue",
  "sync.logDetail.entity.referee": "Referee",
  "sync.logDetail.entity.refereeRole": "Referee Role",
  "sync.logDetail.action.created": "Created",
  "sync.logDetail.action.updated": "Updated",
  "sync.logDetail.action.skipped": "Skipped",
  "sync.logDetail.action.failed": "Failed",
  "sync.toast.triggerFailed": "Failed to trigger sync",
  "sync.toast.connectionLost": "Lost connection to API",
  "sync.toast.connectionLostDescription": "Data may be stale. Retrying in the background.",
  "sync.toast.loadMoreFailed": "Failed to load more logs",

  "teams.title": "Teams",
  "teams.description": "Assign custom names to your club's teams",
  "teams.empty": "No own-club teams found.",
  "teams.columns.apiName": "API Name",
  "teams.columns.league": "League",
  "teams.columns.customName": "Custom Name",
  "teams.placeholder": "Enter custom name...",

  "settings.title": "Settings",
  "settings.description": "Configure your club and manage league tracking",
  "settings.club.title": "Club Configuration",
  "settings.club.description": "Set the club ID from basketball-bund.net. This determines which leagues can be discovered.",
  "settings.club.idLabel": "Club ID",
  "settings.club.idPlaceholder": "e.g. 4121",
  "settings.club.nameLabel": "Club Name",
  "settings.club.namePlaceholder": "e.g. Dragons Rhöndorf",
  "settings.club.idCurrent": "ID: {id}",
  "settings.club.toast.invalidId": "Club ID must be a positive number",
  "settings.club.toast.nameRequired": "Club name is required",
  "settings.club.toast.saved": "Club set to {name}",
  "settings.club.toast.saveFailed": "Failed to save club config",
  "settings.leagues.title": "Tracked Leagues",
  "settings.leagues.description": "Enter the league numbers (liganr) you want to sync, separated by commas.",
  "settings.leagues.numbersLabel": "League Numbers",
  "settings.leagues.numbersPlaceholder": "e.g. 4102, 4105, 4003",
  "settings.leagues.configureClubFirst": "Configure a club above before setting leagues.",
  "settings.leagues.notFound": "Not found: {numbers}",
  "settings.leagues.columns.ligaNr": "Liga Nr",
  "settings.leagues.columns.name": "Name",
  "settings.leagues.columns.season": "Season",
  "settings.leagues.toast.partial": "Saved {tracked} league(s). {notFoundCount} not found: {notFoundList}",
  "settings.leagues.toast.saved": "Tracking {count} league(s)",
  "settings.leagues.toast.saveFailed": "Failed to save league settings",

  "time.justNow": "just now",
  "time.minutesAgo": "{minutes}m ago",
  "time.hoursAgo": "{hours}h ago",
  "time.yesterday": "yesterday",
  "time.daysAgo": "{days}d ago",

  "locale.switch": "Language",
  "locale.de": "Deutsch",
  "locale.en": "English"
}
```

**Step 3: Commit**

```bash
git add apps/web/src/messages/
git commit -m "feat(web): add German and English message files"
```

---

### Task 4: Add TypeScript augmentation for type-safe translation keys

**Files:**
- Create: `apps/web/src/i18n.d.ts`

**Step 1: Create type augmentation file**

Create `apps/web/src/i18n.d.ts`:

```ts
import type messages from "./messages/de.json";

declare module "next-intl" {
  interface AppConfig {
    Messages: typeof messages;
  }
}
```

**Step 2: Verify**

Run: `pnpm --filter @dragons/web typecheck`

If it fails due to JSON module imports, ensure `"resolveJsonModule": true` is in `tsconfig.json` (it already is).

**Step 3: Commit**

```bash
git add apps/web/src/i18n.d.ts
git commit -m "feat(web): add TypeScript augmentation for next-intl message keys"
```

---

### Task 5: Create middleware for locale detection

**Files:**
- Create: `apps/web/src/middleware.ts`

**Step 1: Create middleware**

Create `apps/web/src/middleware.ts`:

```ts
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
```

**Step 2: Commit**

```bash
git add apps/web/src/middleware.ts
git commit -m "feat(web): add next-intl middleware for locale detection"
```

---

### Task 6: Create locale-aware navigation utilities

**Files:**
- Create: `apps/web/src/lib/navigation.ts`

**Step 1: Create navigation module**

Create `apps/web/src/lib/navigation.ts`:

```ts
import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";

export const { Link, redirect, usePathname, useRouter } =
  createNavigation(routing);
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/navigation.ts
git commit -m "feat(web): add locale-aware navigation utilities"
```

---

### Task 7: Restructure app layout for [locale] segment

This is the biggest structural change. We split the root layout (fonts, html/body) from the locale layout (providers, metadata).

**Files:**
- Modify: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/[locale]/layout.tsx`
- Move: `apps/web/src/app/providers.tsx` (update imports)
- Move: `apps/web/src/app/page.tsx` → `apps/web/src/app/[locale]/page.tsx`

**Step 1: Simplify root layout**

Replace `apps/web/src/app/layout.tsx` with a minimal shell (no metadata, no providers — those move to `[locale]/layout.tsx`):

```tsx
import { Geist, Geist_Mono } from "next/font/google";
import "@dragons/ui/globals.css";
import "@daveyplate/better-auth-ui/css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
```

Note: `lang` attribute removed from `<html>` — the `[locale]/layout.tsx` will set it dynamically. Actually, since the `<html>` tag must be in the root layout, we need to pass locale there. Let me adjust — the root layout needs to accept params:

```tsx
import { Geist, Geist_Mono } from "next/font/google";
import "@dragons/ui/globals.css";
import "@daveyplate/better-auth-ui/css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
```

**Step 2: Create locale layout**

Create `apps/web/src/app/[locale]/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Toaster } from "sonner";
import { routing } from "@/i18n/routing";
import { Providers } from "./providers";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: t("title"),
    description: t("description"),
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  return (
    <Providers>
      {children}
    </Providers>
  );
}
```

Note: The `<Toaster />` needs to stay in the root layout since it's outside the locale provider.

Actually, let's keep `<Toaster />` in root layout and move `<Providers>` into `[locale]/layout.tsx`. The root layout keeps just html/body/fonts/toaster.

Revised root layout:
```tsx
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "@dragons/ui/globals.css";
import "@daveyplate/better-auth-ui/css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
```

**Step 3: Move providers.tsx into [locale]/ directory**

Move `apps/web/src/app/providers.tsx` → `apps/web/src/app/[locale]/providers.tsx`.

Update imports to use locale-aware navigation:

```tsx
"use client";

import { AuthUIProvider } from "@daveyplate/better-auth-ui";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Link } from "@/lib/navigation";
import { authClient } from "@/lib/auth-client";

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();

  return (
    <AuthUIProvider
      authClient={authClient}
      navigate={router.push}
      replace={router.replace}
      onSessionChange={() => {
        router.refresh();
      }}
      Link={Link}
    >
      {children}
    </AuthUIProvider>
  );
}
```

**Step 4: Move the home page**

Move `apps/web/src/app/page.tsx` → `apps/web/src/app/[locale]/page.tsx` (contents unchanged for now — it's a demo page).

**Step 5: Move ALL admin pages under [locale]**

Move the entire `apps/web/src/app/admin/` directory to `apps/web/src/app/[locale]/admin/`.

Move `apps/web/src/app/auth/` to `apps/web/src/app/[locale]/auth/`.

**Step 6: Verify the app compiles**

Run: `pnpm --filter @dragons/web build`

Fix any import path issues that arise.

**Step 7: Commit**

```bash
git add apps/web/src/app/
git commit -m "feat(web): restructure app router under [locale] segment"
```

---

### Task 8: Update header with locale-aware navigation and locale switcher

**Files:**
- Modify: `apps/web/src/components/admin/header.tsx`
- Create: `apps/web/src/components/locale-switcher.tsx`

**Step 1: Create locale switcher component**

Create `apps/web/src/components/locale-switcher.tsx`:

```tsx
"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/lib/navigation";
import { Button } from "@dragons/ui/components/button";

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("locale");

  const nextLocale = locale === "de" ? "en" : "de";

  function handleSwitch() {
    router.replace(pathname, { locale: nextLocale });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleSwitch}
      title={t("switch")}
    >
      {nextLocale.toUpperCase()}
    </Button>
  );
}
```

**Step 2: Update header component**

Replace `apps/web/src/components/admin/header.tsx`:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/lib/navigation";
import { cn } from "@dragons/ui/lib/utils";
import { UserButton } from "@daveyplate/better-auth-ui";
import { LocaleSwitcher } from "@/components/locale-switcher";

const navLinks = [
  { href: "/admin/matches" as const, labelKey: "nav.matches" as const },
  { href: "/admin/teams" as const, labelKey: "nav.teams" as const },
  { href: "/admin/sync" as const, labelKey: "nav.sync" as const },
  { href: "/admin/settings" as const, labelKey: "nav.settings" as const },
];

export function Header() {
  const pathname = usePathname();
  const t = useTranslations();

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-6">
        <Link href="/admin" className="text-lg font-semibold tracking-tight">
          {t("nav.brand")}
        </Link>
        <nav className="flex flex-1 items-center gap-1">
          {navLinks.map((link) => {
            const isActive = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(link.labelKey)}
              </Link>
            );
          })}
        </nav>
        <LocaleSwitcher />
        <UserButton />
      </div>
    </header>
  );
}
```

**Step 3: Commit**

```bash
git add apps/web/src/components/admin/header.tsx apps/web/src/components/locale-switcher.tsx
git commit -m "feat(web): add locale switcher and i18n-aware navigation"
```

---

### Task 9: Translate admin page headers (sync, matches, teams, settings)

**Files:**
- Modify: `apps/web/src/app/[locale]/admin/page.tsx`
- Modify: `apps/web/src/app/[locale]/admin/sync/page.tsx`
- Modify: `apps/web/src/app/[locale]/admin/matches/page.tsx`
- Modify: `apps/web/src/app/[locale]/admin/matches/[id]/page.tsx`
- Modify: `apps/web/src/app/[locale]/admin/teams/page.tsx`
- Modify: `apps/web/src/app/[locale]/admin/settings/page.tsx`

**Step 1: Update admin redirect**

In `apps/web/src/app/[locale]/admin/page.tsx`, use locale-aware redirect:

```tsx
import { redirect } from "@/lib/navigation";

export default function AdminPage() {
  redirect("/admin/sync");
}
```

**Step 2: Update sync page**

In `apps/web/src/app/[locale]/admin/sync/page.tsx`, add translations for page header and tab labels:

```tsx
import { getTranslations } from "next-intl/server";
// ... existing imports ...

export default async function SyncPage() {
  const t = await getTranslations();
  // ... existing data fetching ...

  return (
    <div className="space-y-6">
      <SyncProvider ...>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {t("sync.title")}
            </h1>
            <p className="text-muted-foreground">
              {t("sync.description")}
            </p>
          </div>
          <SyncTriggerButton />
        </div>
        {/* ... rest stays the same, but translate tab triggers: */}
        <Tabs defaultValue="history">
          <TabsList>
            <TabsTrigger value="history">{t("sync.tabs.history")}</TabsTrigger>
            <TabsTrigger value="schedule">{t("sync.tabs.schedule")}</TabsTrigger>
          </TabsList>
          {/* ... */}
        </Tabs>
      </SyncProvider>
    </div>
  );
}
```

**Step 3: Update matches page**

Same pattern — use `getTranslations("matches")` for the page title and description.

**Step 4: Update teams page**

Same pattern — use `getTranslations("teams")`.

**Step 5: Update settings page**

Same pattern — use `getTranslations("settings")`.

**Step 6: Update match detail page**

The match detail page is mostly a wrapper — the MatchDetailView component contains the actual strings. Just ensure `Link` imports use `@/lib/navigation`.

**Step 7: Commit**

```bash
git add apps/web/src/app/
git commit -m "feat(web): translate all admin page headers"
```

---

### Task 10: Translate sync components

**Files:**
- Modify: `apps/web/src/components/admin/sync/sync-trigger-button.tsx`
- Modify: `apps/web/src/components/admin/sync/sync-status-cards.tsx`
- Modify: `apps/web/src/components/admin/sync/sync-history-table.tsx`
- Modify: `apps/web/src/components/admin/sync/sync-schedule-config.tsx`
- Modify: `apps/web/src/components/admin/sync/sync-live-logs.tsx`
- Modify: `apps/web/src/components/admin/sync/sync-live-logs-container.tsx`
- Modify: `apps/web/src/components/admin/sync/sync-log-detail.tsx`
- Modify: `apps/web/src/components/admin/sync/sync-provider.tsx`
- Modify: `apps/web/src/components/admin/sync/sync-error-banner.tsx`
- Modify: `apps/web/src/components/admin/sync/utils.ts`

In each file, add `const t = useTranslations("sync")` (or the appropriate namespace) and replace all hardcoded strings with `t("key")` calls using the keys defined in Task 3.

For `sync-status-cards.tsx`, the `getNextRunLabel` function needs `t` passed in or the component refactored to call `t()` inline:

```tsx
// Change from standalone function to inline in the component
const nextRunLabel = useMemo(() => {
  if (!schedule?.enabled) return t("status.disabled");
  try {
    // ... existing countdown calculation ...
    if (diffHours === 0) return t("status.inMinutes", { minutes: diffMinutes });
    if (diffHours < 24) return t("status.inHours", { hours: diffHours, minutes: diffMinutes });
    return t("status.tomorrow");
  } catch {
    return formatCron(schedule.cronExpression);
  }
}, [schedule, t]);
```

For `sync-provider.tsx`, toast messages use `toast.error("string")`. Since `useTranslations` is a hook and provider is already a client component, add `const t = useTranslations("sync.toast")` and replace all toast strings.

For `utils.ts`, the `formatRelativeTime` and `formatCron` functions contain translatable strings. Two options:
1. Keep them as-is and pass translated strings from the calling components
2. Convert them to accept a `t` function parameter

Recommended: option 1 — replace calls to `formatRelativeTime` in components with inline logic using `t()`, or pass `t` as a parameter. Since `formatCron` is used in both status cards and schedule config, make it accept a template: `formatCron(cron, template)` where template is the translated "Daily at {hour}:00" string.

**Step 1: Update each file following the pattern above**

Apply `useTranslations()` to each sync component and replace hardcoded strings.

**Step 2: Commit**

```bash
git add apps/web/src/components/admin/sync/
git commit -m "feat(web): translate all sync dashboard components"
```

---

### Task 11: Translate match components

**Files:**
- Modify: `apps/web/src/components/admin/matches/match-list-table.tsx`
- Modify: `apps/web/src/components/admin/matches/match-detail-view.tsx`
- Modify: `apps/web/src/components/admin/matches/match-override-field.tsx`
- Modify: `apps/web/src/components/admin/matches/diff-indicator.tsx`

In `match-list-table.tsx`: The `columns` array is defined at module scope, not inside a component, so it can't call `useTranslations()`. Two approaches:

**Recommended: Make columns a function that accepts `t`:**

```tsx
function getColumns(t: ReturnType<typeof useTranslations>): ColumnDef<MatchListItem, unknown>[] {
  return [
    {
      accessorKey: "kickoffDate",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("matches.columns.date")} />
      ),
      meta: { label: t("matches.columns.date") },
      // ...
    },
    // ... all other columns
  ];
}

export function MatchListTable({ data, teamOptions }: MatchListTableProps) {
  const t = useTranslations();
  const columns = useMemo(() => getColumns(t), [t]);
  // ...
}
```

In `match-detail-view.tsx`: Add `const t = useTranslations()` and replace all hardcoded labels, toast messages, and section titles. Use `Link` from `@/lib/navigation` instead of `next/link`.

In `diff-indicator.tsx`: Use `useTranslations("matchDetail.diff")` to translate "Diverged", "Synced", "Local".

In `match-override-field.tsx`: Replace "Remote: " with `t("common.remote", { value })` and "Release" with `t("common.release")`.

**Step 1: Apply translations to each file**

**Step 2: Commit**

```bash
git add apps/web/src/components/admin/matches/
git commit -m "feat(web): translate all match components"
```

---

### Task 12: Translate settings and teams components

**Files:**
- Modify: `apps/web/src/components/admin/settings/club-config.tsx`
- Modify: `apps/web/src/components/admin/settings/tracked-leagues.tsx`
- Modify: `apps/web/src/app/[locale]/admin/teams/teams-table.tsx`

Apply `useTranslations()` to each component and replace all hardcoded strings with translation keys.

**Step 1: Apply translations**

**Step 2: Commit**

```bash
git add apps/web/src/components/admin/settings/ apps/web/src/app/
git commit -m "feat(web): translate settings and teams components"
```

---

### Task 13: Translate shared data-table UI components

**Files:**
- Modify: `apps/web/src/components/ui/data-table.tsx`
- Modify: `apps/web/src/components/ui/data-table-toolbar.tsx`
- Modify: `apps/web/src/components/ui/data-table-faceted-filter.tsx`
- Modify: `apps/web/src/components/ui/data-table-date-filter.tsx`
- Modify: `apps/web/src/components/ui/data-table-view-options.tsx`

These components have several hardcoded German strings:
- `data-table.tsx`: "Keine Ergebnisse."
- `data-table-toolbar.tsx`: "Zurücksetzen"
- `data-table-faceted-filter.tsx`: "Keine Ergebnisse.", "{n} gewählt", "Filter zurücksetzen"
- `data-table-date-filter.tsx`: "Zurücksetzen" and calls `formatDate` from `@/lib/format`
- `data-table-view-options.tsx`: "Spalten", "Spalten ein/ausblenden"

Add `useTranslations("common")` to each and replace strings.

**Step 1: Apply translations**

**Step 2: Commit**

```bash
git add apps/web/src/components/ui/
git commit -m "feat(web): translate shared data-table components"
```

---

### Task 14: Unify date/time formatting

**Files:**
- Modify: `apps/web/src/lib/format.ts`
- Modify: `apps/web/src/components/admin/matches/utils.ts`
- Modify: `apps/web/src/components/admin/sync/utils.ts`

**Step 1: Update `lib/format.ts`**

Replace the hardcoded German `formatDate` with a locale-aware version using next-intl's `useFormatter` in calling components:

```ts
// Keep a simple utility that components can use when they don't have access to useFormatter
// (e.g., non-component utility functions). For components, prefer useFormatter().

// This file can be reduced to format utilities that don't need locale:
export function formatScore(
  homeScore: number | null,
  guestScore: number | null,
): string {
  if (homeScore == null || guestScore == null) return "—";
  return `${homeScore}:${guestScore}`;
}
```

Move `formatDate` usage in `data-table-date-filter.tsx` to use `useFormatter().dateTime(date, "short")`.

**Step 2: Update `matches/utils.ts`**

Remove `formatMatchDate` (callers use `useFormatter().dateTime(date, "matchDate")` instead). Keep `formatMatchTime`, `formatScore`, `formatPeriodScores`, `getOwnTeamLabel`, `getOpponentName`, `getTeamColor` — these don't have locale-dependent strings.

**Step 3: Update `sync/utils.ts`**

Keep `formatDuration` (no translatable strings — just "ms", "s", "m" abbreviations).

Remove `formatDate` and `formatRelativeTime` — callers switch to next-intl's `useFormatter().dateTime()` and `useFormatter().relativeTime()` or use translation keys for custom relative labels.

Remove `formatCron` — callers use `t("sync.schedule.cronFormat", { hour })` instead.

**Step 4: Update all callers**

In `match-list-table.tsx` and `match-detail-view.tsx`, replace `formatMatchDate(str)` calls with a component-level formatter:

```tsx
const format = useFormatter();
// In cell renderer:
format.dateTime(new Date(row.original.kickoffDate + "T00:00:00"), "matchDate")
```

In `sync-history-table.tsx`, replace `formatDate(run.startedAt)` with:

```tsx
const format = useFormatter();
format.dateTime(new Date(run.startedAt), "syncTimestamp")
```

In `sync-status-cards.tsx`, replace `formatRelativeTime` with:

```tsx
const format = useFormatter();
format.relativeTime(new Date(lastSync.startedAt))
```

**Step 5: Commit**

```bash
git add apps/web/src/lib/format.ts apps/web/src/components/admin/matches/utils.ts apps/web/src/components/admin/sync/utils.ts apps/web/src/components/admin/matches/ apps/web/src/components/admin/sync/
git commit -m "feat(web): unify date/time formatting through next-intl"
```

---

### Task 15: Update all Link and navigation imports

**Files:**
- All files that import from `next/link` or `next/navigation`

Do a codebase-wide search for `from "next/link"` and `from "next/navigation"` in the `apps/web/src/` directory. Replace with imports from `@/lib/navigation`.

**Exceptions:**
- `apps/web/src/app/layout.tsx` (root layout — no locale context)
- `apps/web/src/app/[locale]/providers.tsx` — `useRouter` from `next/navigation` is fine here since it's used by AuthUIProvider for non-locale-aware navigation
- Any file using `notFound` from `next/navigation` — keep as-is (not locale-dependent)

Key files to update:
- `apps/web/src/components/admin/header.tsx` (already done in Task 8)
- `apps/web/src/components/admin/matches/match-detail-view.tsx` (`Link` from `next/link`, `useRouter` from `next/navigation`)
- `apps/web/src/components/admin/matches/match-list-table.tsx` (`useRouter` from `next/navigation`)

**Step 1: Apply changes**

**Step 2: Commit**

```bash
git add apps/web/src/
git commit -m "feat(web): switch all navigation imports to locale-aware versions"
```

---

### Task 16: Add message completeness test

**Files:**
- Create: `apps/web/src/messages/messages.test.ts`

**Step 1: Write test**

Create `apps/web/src/messages/messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import de from "./de.json";
import en from "./en.json";

function flatKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null) {
      return flatKeys(value as Record<string, unknown>, fullKey);
    }
    return [fullKey];
  });
}

describe("i18n messages", () => {
  it("German and English have the same keys", () => {
    const deKeys = flatKeys(de).sort();
    const enKeys = flatKeys(en).sort();
    expect(deKeys).toEqual(enKeys);
  });

  it("no empty translation values", () => {
    for (const [key, value] of Object.entries(de)) {
      expect(value, `de.json: "${key}" is empty`).not.toBe("");
    }
    for (const [key, value] of Object.entries(en)) {
      expect(value, `en.json: "${key}" is empty`).not.toBe("");
    }
  });
});
```

**Step 2: Run the test**

Run: `pnpm --filter @dragons/web test` (if vitest is configured for web) or set up vitest for the web package.

Note: The web package may not have vitest configured yet (tests are currently only in `apps/api`). If so, skip running and add this test to run as part of the lint/typecheck step, or add vitest to the web package.

**Step 3: Commit**

```bash
git add apps/web/src/messages/messages.test.ts
git commit -m "test(web): add message completeness test for i18n"
```

---

### Task 17: Verify build and fix issues

**Step 1: Run typecheck**

Run: `pnpm --filter @dragons/web typecheck`

Fix any TypeScript errors.

**Step 2: Run lint**

Run: `pnpm --filter @dragons/web lint`

Fix any lint errors (unused imports from `next/link`, etc.).

**Step 3: Run build**

Run: `pnpm --filter @dragons/web build`

Fix any build errors. Common issues:
- Missing `setRequestLocale(locale)` calls in page components for static rendering
- Import path mismatches after the directory restructure
- JSON import resolution

**Step 4: Run full workspace checks**

Run: `pnpm lint && pnpm typecheck`

**Step 5: Commit any fixes**

```bash
git add .
git commit -m "fix(web): resolve build and typecheck issues after i18n setup"
```

---

### Task 18: Manual smoke test

**Step 1: Start dev server**

Run: `pnpm --filter @dragons/web dev`

**Step 2: Test German (default)**

- Visit `http://localhost:3000/admin/sync` — should show German UI
- Verify no `/de/` prefix in URL (as-needed strategy)
- Check all pages: sync, matches, teams, settings
- Verify dates format in German style

**Step 3: Test English**

- Click locale switcher to switch to English
- URL should change to `/en/admin/sync`
- Verify all text is English
- Check all pages
- Verify dates format in English style

**Step 4: Test locale detection**

- Clear cookies
- Set browser language to English
- Visit `http://localhost:3000/admin/sync`
- Should redirect to `/en/admin/sync`

**Step 5: Fix any visual or translation issues discovered during testing**

**Step 6: Commit**

```bash
git add .
git commit -m "fix(web): address issues found during i18n smoke test"
```
