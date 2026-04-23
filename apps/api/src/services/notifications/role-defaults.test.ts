import { describe, expect, it } from "vitest";
import { getDefaultNotificationsForEvent } from "./role-defaults";

describe("getDefaultNotificationsForEvent", () => {
  // ── Admin defaults ──────────────────────────────────────────────────────

  describe("admin defaults", () => {
    it.each([
      "match.cancelled",
      "match.schedule.changed",
      "match.created",
      "booking.created",
      "booking.status.changed",
      "override.applied",
      "referee.assigned",
      "referee.unassigned",
      "referee.reassigned",
    ])("admin receives %s events", (eventType) => {
      const result = getDefaultNotificationsForEvent(eventType, {}, "sync");
      const adminInApp = result.filter(
        (n) => n.audience === "admin" && n.channel === "in_app",
      );
      expect(adminInApp).toHaveLength(1);
      expect(adminInApp[0]).toEqual({ audience: "admin", channel: "in_app" });
    });

    it("admin does not receive unrelated events", () => {
      const result = getDefaultNotificationsForEvent(
        "sync.completed",
        {},
        "sync",
      );
      const adminNotifs = result.filter((n) => n.audience === "admin");
      expect(adminNotifs).toHaveLength(0);
    });
  });

  // ── Referee defaults ────────────────────────────────────────────────────

  describe("referee defaults", () => {
    it("referee receives referee.assigned for their refereeId", () => {
      const result = getDefaultNotificationsForEvent(
        "referee.assigned",
        { refereeId: 42 },
        "sync",
      );
      const refInApp = result.filter(
        (n) => n.audience === "referee" && n.channel === "in_app",
      );
      expect(refInApp).toHaveLength(1);
      expect(refInApp[0]).toEqual({
        audience: "referee",
        channel: "in_app",
        refereeId: 42,
      });
    });

    it("referee receives referee.unassigned for their refereeId", () => {
      const result = getDefaultNotificationsForEvent(
        "referee.unassigned",
        { refereeId: 7 },
        "sync",
      );
      const refInApp = result.filter(
        (n) => n.audience === "referee" && n.channel === "in_app",
      );
      expect(refInApp).toHaveLength(1);
      expect(refInApp[0]!.refereeId).toBe(7);
    });

    it("no referee notification when refereeId missing from payload", () => {
      const result = getDefaultNotificationsForEvent(
        "referee.assigned",
        {},
        "sync",
      );
      const refNotifs = result.filter((n) => n.audience === "referee");
      expect(refNotifs).toHaveLength(0);
    });

    it("referee does not receive match events", () => {
      const result = getDefaultNotificationsForEvent(
        "match.cancelled",
        { refereeId: 42 },
        "sync",
      );
      const refNotifs = result.filter((n) => n.audience === "referee");
      expect(refNotifs).toHaveLength(0);
    });
  });

  // ── Reassignment ────────────────────────────────────────────────────────

  describe("referee.reassigned", () => {
    it("notifies both old and new referee", () => {
      const result = getDefaultNotificationsForEvent(
        "referee.reassigned",
        { oldRefereeId: 10, newRefereeId: 20 },
        "sync",
      );
      const refInApp = result.filter(
        (n) => n.audience === "referee" && n.channel === "in_app",
      );
      expect(refInApp).toHaveLength(2);
      expect(refInApp.map((n) => n.refereeId).sort()).toEqual([10, 20]);
    });

    it("notifies only new referee when old is missing", () => {
      const result = getDefaultNotificationsForEvent(
        "referee.reassigned",
        { newRefereeId: 20 },
        "sync",
      );
      const refInApp = result.filter(
        (n) => n.audience === "referee" && n.channel === "in_app",
      );
      expect(refInApp).toHaveLength(1);
      expect(refInApp[0]!.refereeId).toBe(20);
    });

    it("notifies only old referee when new is missing", () => {
      const result = getDefaultNotificationsForEvent(
        "referee.reassigned",
        { oldRefereeId: 10 },
        "sync",
      );
      const refInApp = result.filter(
        (n) => n.audience === "referee" && n.channel === "in_app",
      );
      expect(refInApp).toHaveLength(1);
      expect(refInApp[0]!.refereeId).toBe(10);
    });

    it("also sends admin notification for reassignment", () => {
      const result = getDefaultNotificationsForEvent(
        "referee.reassigned",
        { oldRefereeId: 10, newRefereeId: 20 },
        "sync",
      );
      const adminInApp = result.filter(
        (n) => n.audience === "admin" && n.channel === "in_app",
      );
      expect(adminInApp).toHaveLength(1);
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles string refereeId in payload", () => {
      const result = getDefaultNotificationsForEvent(
        "referee.assigned",
        { refereeId: "42" },
        "sync",
      );
      const refInApp = result.filter(
        (n) => n.audience === "referee" && n.channel === "in_app",
      );
      expect(refInApp).toHaveLength(1);
      expect(refInApp[0]!.refereeId).toBe(42);
    });

    it("returns empty array for unknown event type", () => {
      const result = getDefaultNotificationsForEvent(
        "unknown.event",
        {},
        "sync",
      );
      expect(result).toEqual([]);
    });
  });

  describe("PUSH_ELIGIBLE_EVENTS fan-out", () => {
    it("emits both in_app and push for referee.assigned", () => {
      const out = getDefaultNotificationsForEvent(
        "referee.assigned",
        { refereeId: 42 },
        "test",
      );
      const channels = out
        .filter((n) => n.refereeId === 42)
        .map((n) => n.channel)
        .sort();
      expect(channels).toEqual(["in_app", "push"]);
    });

    it("emits in_app + push for admin on referee.slots.needed", () => {
      const out = getDefaultNotificationsForEvent(
        "referee.slots.needed",
        {},
        "test",
      );
      const channels = out
        .filter((n) => n.audience === "admin")
        .map((n) => n.channel)
        .sort();
      expect(channels).toEqual(["in_app", "push"]);
    });

    it("emits in_app + push for both old and new referee on reassignment", () => {
      const out = getDefaultNotificationsForEvent(
        "referee.reassigned",
        { oldRefereeId: 1, newRefereeId: 2 },
        "test",
      );
      const oldChannels = out
        .filter((n) => n.refereeId === 1)
        .map((n) => n.channel)
        .sort();
      const newChannels = out
        .filter((n) => n.refereeId === 2)
        .map((n) => n.channel)
        .sort();
      expect(oldChannels).toEqual(["in_app", "push"]);
      expect(newChannels).toEqual(["in_app", "push"]);
    });

    it("does NOT emit push for non-eligible event (e.g., booking.created)", () => {
      const out = getDefaultNotificationsForEvent("booking.created", {}, "test");
      const pushEntries = out.filter((n) => n.channel === "push");
      expect(pushEntries).toEqual([]);
    });

    it("emits in_app + push for urgent match events", () => {
      const cancelled = getDefaultNotificationsForEvent(
        "match.cancelled",
        {},
        "test",
      );
      const rescheduled = getDefaultNotificationsForEvent(
        "match.rescheduled",
        {},
        "test",
      );
      expect(cancelled.some((n) => n.channel === "push")).toBe(true);
      expect(rescheduled.some((n) => n.channel === "push")).toBe(true);
    });
  });

  // ── PUSH_ELIGIBLE_EVENTS invariants ────────────────────────────────────
  //
  // Pins two contracts that were easy to accidentally break during the push
  // fan-out rollout: no duplicate in_app entries per (audience, refereeId)
  // tuple, and every in_app entry on a push-eligible event has a matching
  // push entry. If either invariant fails, we'll either spam users with
  // double notifications or silently drop push rows.
  describe("PUSH_ELIGIBLE_EVENTS invariants", () => {
    const eligibleEvents = [
      { type: "referee.assigned", payload: { refereeId: 42 } },
      { type: "referee.unassigned", payload: { refereeId: 42 } },
      {
        type: "referee.reassigned",
        payload: { oldRefereeId: 1, newRefereeId: 2 },
      },
      { type: "referee.slots.needed", payload: {} },
      { type: "referee.slots.reminder", payload: {} },
      { type: "match.cancelled", payload: {} },
      { type: "match.rescheduled", payload: {} },
    ];

    it.each(eligibleEvents)(
      "$type: no duplicate in_app entries per audience+refereeId",
      ({ type, payload }) => {
        const out = getDefaultNotificationsForEvent(type, payload, "test");
        const inApp = out.filter((n) => n.channel === "in_app");
        const keys = inApp.map(
          (n) => `${n.audience}:${n.refereeId ?? "_"}`,
        );
        expect(new Set(keys).size).toBe(keys.length);
      },
    );

    it.each(eligibleEvents)(
      "$type: every in_app entry has a matching push entry",
      ({ type, payload }) => {
        const out = getDefaultNotificationsForEvent(type, payload, "test");
        const inAppKeys = new Set(
          out
            .filter((n) => n.channel === "in_app")
            .map((n) => `${n.audience}:${n.refereeId ?? "_"}`),
        );
        const pushKeys = new Set(
          out
            .filter((n) => n.channel === "push")
            .map((n) => `${n.audience}:${n.refereeId ?? "_"}`),
        );
        expect(pushKeys).toEqual(inAppKeys);
      },
    );
  });
});
