import { describe, expect, it } from "vitest";
import { EVENT_TYPES, validateEventPayload } from "@dragons/shared";
import { renderPushTemplate } from "./index";

/**
 * These payloads mirror, field for field, what the two match emit sites build:
 *   - `match-admin.service.ts` (manual edit, `source: "manual"`)
 *   - `matches.sync.ts` (federation sync, `source: "sync"`)
 *
 * Both halves of the contract are asserted here: the payload validates against
 * the canonical schema in `@dragons/shared`, and the push template renders it
 * without throwing and without leaking `undefined`/`null` into a user-facing
 * string. `match.cancelled` used to fail both — no emit site published the
 * `matchId`/`kickoffDate`/`kickoffTime` the template required, so it deep-linked
 * to `/game/undefined` and `formatDate` threw on `undefined.split` inside the
 * push adapter's probe render, killing the notification in dispatch (#124).
 */

const adminBase = {
  matchNo: 1234,
  homeTeam: "Dragons U18",
  guestTeam: "TV Buchholz",
  leagueId: 7,
  teamIds: [11, 22],
  matchId: 555,
  kickoffDate: "2026-06-01",
  kickoffTime: "18:00:00",
};

const cancelledFromAdmin = { ...adminBase, leagueName: "", reason: "Hallensperrung" };

const cancelledFromSync = {
  matchNo: 1234,
  homeTeam: "Dragons U18",
  guestTeam: "TV Buchholz",
  leagueName: "Oberliga",
  leagueId: 7,
  teamIds: [11, 22],
  matchId: 555,
  kickoffDate: "2026-06-01",
  kickoffTime: "18:00:00",
};

const scheduleChangedFromAdmin = {
  ...adminBase,
  leagueName: "",
  changes: [
    { field: "kickoffDate", oldValue: "2026-05-30", newValue: "2026-06-01" },
    { field: "kickoffTime", oldValue: "17:00:00", newValue: "18:00:00" },
  ],
};

const scheduleChangedFromSync = {
  ...cancelledFromSync,
  changes: [{ field: "kickoffTime", oldValue: "17:00:00", newValue: "18:00:00" }],
};

const clean = (value: unknown): void => {
  expect(String(value)).not.toContain("undefined");
  expect(String(value)).not.toContain("null");
};

function renderBoth(eventType: string, payload: Record<string, unknown>) {
  return (["de", "en"] as const).map((locale) => {
    const out = renderPushTemplate({ eventType, payload, locale, eventId: "evt_1" });
    expect(out, `no push template rendered for ${eventType}`).not.toBeNull();
    return out!;
  });
}

describe("match push contract (real emitted payloads)", () => {
  const cases = [
    { name: "match.cancelled (manual edit)", type: EVENT_TYPES.MATCH_CANCELLED, payload: cancelledFromAdmin },
    { name: "match.cancelled (sync)", type: EVENT_TYPES.MATCH_CANCELLED, payload: cancelledFromSync },
    { name: "match.schedule.changed (manual edit)", type: EVENT_TYPES.MATCH_SCHEDULE_CHANGED, payload: scheduleChangedFromAdmin },
    { name: "match.schedule.changed (sync)", type: EVENT_TYPES.MATCH_SCHEDULE_CHANGED, payload: scheduleChangedFromSync },
  ];

  for (const { name, type, payload } of cases) {
    it(`${name} satisfies the canonical payload schema`, () => {
      const validation = validateEventPayload(type, payload);
      expect(validation.issues ?? []).toEqual([]);
      expect(validation.valid).toBe(true);
    });

    it(`${name} renders a clean push that deep-links to the match`, () => {
      for (const out of renderBoth(type, payload)) {
        clean(out.title);
        clean(out.body);
        expect(out.data.deepLink).toBe("/game/555");
        expect(out.data.eventType).toBe(type);
        expect(out.data.eventId).toBe("evt_1");
      }
    });
  }

  it("match.cancelled names both teams and the kickoff", () => {
    const [de, en] = renderBoth(EVENT_TYPES.MATCH_CANCELLED, cancelledFromAdmin);
    expect(de!.body).toContain("Dragons U18 vs. TV Buchholz");
    expect(de!.body).toContain("01.06.2026 18:00");
    expect(en!.body).toContain("2026-06-01 18:00");
  });

  it("match.removed from referee-games.sync has no push template", () => {
    // Sanity check that the contract table above is the complete set of match
    // events with a push: match.removed shares the outcome schema but renders
    // nothing, so an unlinked referee game (matchId null) cannot deep-link.
    const out = renderPushTemplate({
      eventType: EVENT_TYPES.MATCH_REMOVED,
      payload: { ...cancelledFromSync, matchId: null },
      locale: "de",
    });
    expect(out).toBeNull();
  });
});
