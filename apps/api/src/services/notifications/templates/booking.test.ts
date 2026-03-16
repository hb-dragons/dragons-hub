import { describe, expect, it } from "vitest";
import { renderBookingMessage } from "./booking";
import { EVENT_TYPES } from "@dragons/shared";

describe("renderBookingMessage", () => {
  describe(EVENT_TYPES.BOOKING_CREATED, () => {
    const payload = {
      venueName: "Sporthalle Nord",
      date: "2026-04-15",
      startTime: "18:00",
      endTime: "20:00",
      matchCount: 2,
    };

    it("renders booking created in German", () => {
      const result = renderBookingMessage(
        EVENT_TYPES.BOOKING_CREATED,
        payload,
        "Sporthalle Nord",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Neue Hallenbuchung");
      expect(result!.body).toContain("Sporthalle Nord");
      expect(result!.body).toContain("15.04.");
      expect(result!.body).toContain("18:00");
      expect(result!.body).toContain("20:00");
    });

    it("renders booking created in English", () => {
      const result = renderBookingMessage(
        EVENT_TYPES.BOOKING_CREATED,
        payload,
        "Sporthalle Nord",
        "en",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("New booking");
      expect(result!.body).toContain("Sporthalle Nord");
      expect(result!.body).toContain("04/15");
    });

    it("handles missing date gracefully", () => {
      const sparse = { venueName: "Halle", startTime: "18:00", endTime: "20:00" };
      const result = renderBookingMessage(
        EVENT_TYPES.BOOKING_CREATED,
        sparse,
        "Halle",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.body).toContain("Halle");
    });
  });

  describe(EVENT_TYPES.BOOKING_STATUS_CHANGED, () => {
    const payload = {
      venueName: "Sporthalle Ost",
      date: "2026-05-01",
      oldStartTime: "18:00",
      oldEndTime: "20:00",
      newStartTime: "19:00",
      newEndTime: "21:00",
    };

    it("renders status change in German", () => {
      const result = renderBookingMessage(
        EVENT_TYPES.BOOKING_STATUS_CHANGED,
        payload,
        "Sporthalle Ost",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toBeDefined();
      expect(result!.body).toContain("Sporthalle Ost");
    });

    it("renders status change in English", () => {
      const result = renderBookingMessage(
        EVENT_TYPES.BOOKING_STATUS_CHANGED,
        payload,
        "Sporthalle Ost",
        "en",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toBeDefined();
      expect(result!.body).toContain("Sporthalle Ost");
    });
  });

  describe(EVENT_TYPES.BOOKING_NEEDS_RECONFIRMATION, () => {
    const payload = {
      venueName: "Sporthalle Mitte",
      date: "2026-07-20",
      reason: "Hallenbelegungsplan geaendert",
    };

    it("renders reconfirmation in German", () => {
      const result = renderBookingMessage(
        EVENT_TYPES.BOOKING_NEEDS_RECONFIRMATION,
        payload,
        "Sporthalle Mitte",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("ckbest");
      expect(result!.body).toContain("ckbest");
      expect(result!.body).toContain("Sporthalle Mitte");
    });

    it("renders reconfirmation in English", () => {
      const result = renderBookingMessage(
        EVENT_TYPES.BOOKING_NEEDS_RECONFIRMATION,
        payload,
        "Sporthalle Mitte",
        "en",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Reconfirmation needed");
      expect(result!.body).toContain("needs reconfirmation");
    });
  });

  describe("unknown event type", () => {
    it("returns null for non-booking events", () => {
      const result = renderBookingMessage(
        "match.cancelled",
        {},
        "entity",
        "de",
      );
      expect(result).toBeNull();
    });
  });
});
