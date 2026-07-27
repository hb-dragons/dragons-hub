import { describe, expect, it } from "vitest";
import { renderMatchCancelledPush } from "./match-cancelled";

const payload = {
  matchId: 555,
  matchNo: 1234,
  homeTeam: "Dragons",
  guestTeam: "Sharks",
  leagueName: "Oberliga",
  leagueId: 7,
  teamIds: [1, 2],
  kickoffDate: "2026-06-01",
  kickoffTime: "18:00:00",
  reason: "Hallensperrung",
};

describe("renderMatchCancelledPush", () => {
  it("renders German", () => {
    const out = renderMatchCancelledPush(payload, "de");
    expect(out.title).toContain("abgesagt");
    expect(out.body).toContain("Dragons");
    expect(out.body).toContain("Sharks");
    expect(out.body).toContain("01.06.2026");
    // Seconds are dropped: a push reads "18:00", not "18:00:00".
    expect(out.body).toContain("18:00");
    expect(out.body).not.toContain("18:00:00");
    expect(out.data.deepLink).toBe("/game/555");
    expect(out.data.eventType).toBe("match.cancelled");
  });

  it("renders English", () => {
    const out = renderMatchCancelledPush(payload, "en");
    expect(out.title.toLowerCase()).toContain("cancelled");
    expect(out.body).toContain("2026-06-01");
    expect(out.body.toLowerCase()).toContain("has been cancelled");
  });

  it("falls back to a declared route when the event carries no match id", () => {
    for (const locale of ["de", "en"] as const) {
      const out = renderMatchCancelledPush({ ...payload, matchId: null }, locale);
      expect(out.data.deepLink).toBe("/schedule");
      expect(String(out.data.deepLink)).not.toContain("undefined");
      expect(String(out.data.deepLink)).not.toContain("null");
    }
  });

  it("shortens the sentence instead of throwing when the kickoff is absent", () => {
    // This is the exact shape the emit sites published before #124: no kickoff
    // at all. The old template called formatDate on it and threw on
    // `undefined.split` inside the push adapter's probe render.
    const { kickoffDate, kickoffTime, ...noKickoff } = payload;
    void kickoffDate;
    void kickoffTime;

    for (const locale of ["de", "en"] as const) {
      const out = renderMatchCancelledPush(noKickoff, locale);
      expect(out.body).toContain("Dragons vs. Sharks");
      expect(out.body).not.toContain("undefined");
      expect(out.body).not.toContain("null");
      expect(out.body).not.toContain("(");
    }
  });

  it("drops a null kickoff rather than printing it", () => {
    const out = renderMatchCancelledPush(
      { ...payload, kickoffDate: null, kickoffTime: null },
      "de",
    );
    expect(out.body).toBe("Dragons vs. Sharks wurde abgesagt.");
  });

  it("keeps a partial kickoff (date known, time not)", () => {
    const out = renderMatchCancelledPush({ ...payload, kickoffTime: null }, "de");
    expect(out.body).toBe("Dragons vs. Sharks (01.06.2026) wurde abgesagt.");
  });

  it("passes a non-ISO kickoff value through untouched", () => {
    const out = renderMatchCancelledPush(
      { ...payload, kickoffDate: "TBD", kickoffTime: "  " },
      "de",
    );
    expect(out.body).toBe("Dragons vs. Sharks (TBD) wurde abgesagt.");
  });
});
