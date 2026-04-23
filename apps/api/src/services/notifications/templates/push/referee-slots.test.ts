import { describe, expect, it } from "vitest";
import { renderRefereeSlotsPush } from "./referee-slots";

const payload = {
  matchId: 99,
  homeTeam: "Dragons U18",
  guestTeam: "TV Buchholz",
  kickoffDate: "2026-05-10",
  kickoffTime: "16:00",
  sr1Open: true,
  sr2Open: true,
  sr1Assigned: null as string | null,
  sr2Assigned: null as string | null,
  reminderLevel: 3 as number | undefined,
  eventId: "evt_slots_1",
};

describe("renderRefereeSlotsPush", () => {
  it("initial notification (no reminder level)", () => {
    const out = renderRefereeSlotsPush({ ...payload, reminderLevel: undefined }, "de", "needed");
    expect(out.title).toContain("Schiedsrichter");
    expect(out.body).toContain("Dragons U18");
    expect(out.data.eventType).toBe("referee.slots.needed");
    expect(out.data.deepLink).toBe("/(tabs)/referee");
  });

  it("reminder reflects days-until kickoff", () => {
    const out = renderRefereeSlotsPush(payload, "de", "reminder");
    expect(out.body).toContain("3");
    expect(out.data.eventType).toBe("referee.slots.reminder");
  });

  it("reflects partial fill in body", () => {
    const out = renderRefereeSlotsPush(
      { ...payload, sr1Open: false, sr1Assigned: "Max Mustermann" },
      "de",
      "reminder",
    );
    expect(out.body).toContain("SR2");
  });
});
