import { describe, expect, it } from "vitest";
import { EVENT_TYPES } from "@dragons/shared";
import { renderMatchScheduleChangedPush } from "./match-schedule-changed";
import { renderPushTemplate } from "./index";
import { getDefaultNotificationsForEvent } from "../../role-defaults";

// The payloads below are copied from the two real emit sites:
//   - matches.sync.ts        (sync path: changes[] only, no top-level kickoff)
//   - match-admin.service.ts (manual edit: changes[] + top-level kickoffDate)
// Neither publishes oldKickoffDate/oldKickoffTime/kickoffTime, which is what the
// old template read — so a rename alone would have pushed "undefined" to users.

/** matches.sync.ts — both kickoff fields moved. */
const syncBothChanged = {
  matchNo: 42,
  homeTeam: "Dragons U16",
  guestTeam: "TSV Neustadt",
  leagueName: "Bezirksliga",
  leagueId: 9,
  teamIds: [1, 2],
  changes: [
    { field: "kickoffDate", oldValue: "2026-06-08", newValue: "2026-06-10" },
    { field: "kickoffTime", oldValue: "18:00", newValue: "17:30" },
  ],
};

/** match-admin.service.ts — time-only edit, carries an effective kickoffDate. */
const adminTimeOnly = {
  matchNo: 42,
  homeTeam: "Dragons U16",
  guestTeam: "TSV Neustadt",
  leagueName: "",
  leagueId: 9,
  teamIds: [1, 2],
  kickoffDate: "2026-06-10",
  changes: [{ field: "kickoffTime", oldValue: "18:00", newValue: "17:30" }],
};

const dateOnly = {
  ...syncBothChanged,
  changes: [
    { field: "kickoffDate", oldValue: "2026-06-08", newValue: "2026-06-10" },
  ],
};

describe("renderMatchScheduleChangedPush", () => {
  it("renders the real old and new kickoff from changes[] (de)", () => {
    const out = renderMatchScheduleChangedPush(syncBothChanged, "de");
    expect(out.title).not.toContain("undefined");
    expect(out.body).not.toContain("undefined");
    expect(out.body).toContain("Dragons U16");
    expect(out.body).toContain("TSV Neustadt");
    expect(out.body).toContain("10.06.2026");
    expect(out.body).toContain("17:30");
    expect(out.body).toContain("08.06.2026");
    expect(out.body).toContain("18:00");
    expect(out.data.eventType).toBe(EVENT_TYPES.MATCH_SCHEDULE_CHANGED);
  });

  it("renders the real old and new kickoff from changes[] (en)", () => {
    const out = renderMatchScheduleChangedPush(syncBothChanged, "en");
    expect(out.title).not.toContain("undefined");
    expect(out.body).not.toContain("undefined");
    expect(out.body).toContain("2026-06-10");
    expect(out.body).toContain("2026-06-08");
    expect(out.body).toContain("17:30");
    expect(out.body).toContain("18:00");
  });

  it("renders a time-only change (admin edit payload)", () => {
    for (const locale of ["de", "en"] as const) {
      const out = renderMatchScheduleChangedPush(adminTimeOnly, locale);
      expect(out.body).not.toContain("undefined");
      expect(out.body).toContain("17:30");
      expect(out.body).toContain("18:00");
    }
  });

  it("renders a date-only change", () => {
    const out = renderMatchScheduleChangedPush(dateOnly, "de");
    expect(out.body).not.toContain("undefined");
    expect(out.body).toContain("10.06.2026");
    expect(out.body).toContain("08.06.2026");
  });

  it("trims seconds off kickoff times", () => {
    const out = renderMatchScheduleChangedPush(
      {
        ...syncBothChanged,
        changes: [
          { field: "kickoffTime", oldValue: "18:00:00", newValue: "17:30:00" },
        ],
      },
      "de",
    );
    expect(out.body).toContain("17:30");
    expect(out.body).not.toContain("17:30:00");
  });

  it("never renders 'undefined' or 'null' when changes[] is missing", () => {
    for (const locale of ["de", "en"] as const) {
      const out = renderMatchScheduleChangedPush(
        { matchNo: 42, homeTeam: "Dragons U16", guestTeam: "TSV Neustadt", leagueName: "", teamIds: [] },
        locale,
      );
      expect(out.title).not.toContain("undefined");
      expect(out.body).not.toContain("undefined");
      expect(out.body).not.toContain("null");
      expect(out.body).toContain("Dragons U16");
    }
  });

  it("never renders 'undefined' or 'null' when changes[] is empty", () => {
    const out = renderMatchScheduleChangedPush(
      { ...syncBothChanged, changes: [] },
      "de",
    );
    expect(out.body).not.toContain("undefined");
    expect(out.body).not.toContain("null");
  });

  it("drops a null old value instead of printing 'null'", () => {
    for (const locale of ["de", "en"] as const) {
      const out = renderMatchScheduleChangedPush(
        {
          ...syncBothChanged,
          changes: [
            { field: "kickoffDate", oldValue: null, newValue: "2026-06-10" },
            { field: "kickoffTime", oldValue: null, newValue: "17:30" },
          ],
        },
        locale,
      );
      expect(out.body).not.toContain("null");
      expect(out.body).not.toContain("undefined");
      expect(out.body).toContain("17:30");
    }
  });

  it("ignores a null new value", () => {
    const out = renderMatchScheduleChangedPush(
      {
        ...syncBothChanged,
        changes: [{ field: "kickoffDate", oldValue: "2026-06-08", newValue: null }],
      },
      "de",
    );
    expect(out.body).not.toContain("null");
    expect(out.body).not.toContain("undefined");
  });

  it("passes a non-HH:MM time through instead of slicing it into nonsense", () => {
    const out = renderMatchScheduleChangedPush(
      {
        ...syncBothChanged,
        changes: [{ field: "kickoffTime", oldValue: "offen", newValue: "nachmittags" }],
      },
      "de",
    );
    expect(out.body).not.toContain("undefined");
    expect(out.body).toContain("nachmittags");
    expect(out.body).toContain("offen");
  });

  it("passes a non-ISO date through instead of formatting it into 'undefined'", () => {
    const out = renderMatchScheduleChangedPush(
      {
        ...syncBothChanged,
        changes: [{ field: "kickoffDate", oldValue: "TBD", newValue: "TBA" }],
      },
      "de",
    );
    expect(out.body).not.toContain("undefined");
    expect(out.body).toContain("TBA");
  });

  it("ignores non-kickoff fields in changes[]", () => {
    const out = renderMatchScheduleChangedPush(
      {
        ...syncBothChanged,
        changes: [{ field: "venueId", oldValue: "1", newValue: "2" }],
      },
      "en",
    );
    expect(out.body).not.toContain("undefined");
    expect(out.body).not.toContain("venueId");
  });

  it("deep-links to the match when the payload carries a matchId", () => {
    const out = renderMatchScheduleChangedPush(
      { ...syncBothChanged, matchId: 777 },
      "de",
    );
    expect(out.data.deepLink).toBe("/game/777");
  });

  it("falls back to a real route when no matchId is published", () => {
    const out = renderMatchScheduleChangedPush(syncBothChanged, "de");
    expect(out.data.deepLink).toBe("/schedule");
    expect(String(out.data.deepLink)).not.toContain("undefined");
  });
});

describe("match.schedule.changed push dispatch contract", () => {
  it("renderPushTemplate resolves the real event name and injects eventId", () => {
    const out = renderPushTemplate({
      eventType: EVENT_TYPES.MATCH_SCHEDULE_CHANGED,
      payload: syncBothChanged,
      locale: "de",
      eventId: "evt_sched_1",
    });
    expect(out).not.toBeNull();
    expect(out!.title).not.toContain("undefined");
    expect(out!.body).not.toContain("undefined");
    expect(out!.body).toContain("10.06.2026");
    expect(out!.data.eventId).toBe("evt_sched_1");
  });

  it("has no template for the event name 'match.rescheduled', which nobody emits", () => {
    const out = renderPushTemplate({
      eventType: "match.rescheduled",
      payload: syncBothChanged,
      locale: "de",
    });
    expect(out).toBeNull();
  });

  it("every push default for a schedule change has a renderable template", () => {
    const defaults = getDefaultNotificationsForEvent(
      EVENT_TYPES.MATCH_SCHEDULE_CHANGED,
      syncBothChanged,
      "sync",
    );
    const pushDefaults = defaults.filter((n) => n.channel === "push");
    expect(pushDefaults.length).toBeGreaterThan(0);
    for (const _ of pushDefaults) {
      const rendered = renderPushTemplate({
        eventType: EVENT_TYPES.MATCH_SCHEDULE_CHANGED,
        payload: syncBothChanged,
        locale: "de",
        eventId: "evt_sched_2",
      });
      expect(rendered).not.toBeNull();
    }
  });
});
