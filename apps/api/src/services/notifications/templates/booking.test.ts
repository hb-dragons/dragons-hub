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

  describe(`${EVENT_TYPES.BOOKING_STATUS_CHANGED} (cancelled variant)`, () => {
    const cancelledPayload = {
      venueName: "Sporthalle Ost",
      date: "2026-05-01",
      reason: "Doppelbelegung",
    };

    it("renders cancelled booking in German with reason", () => {
      const result = renderBookingMessage(
        EVENT_TYPES.BOOKING_STATUS_CHANGED,
        cancelledPayload,
        "Sporthalle Ost",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Buchung storniert");
      expect(result!.body).toContain("storniert");
      expect(result!.body).toContain("Doppelbelegung");
    });

    it("renders cancelled booking in English with reason", () => {
      const result = renderBookingMessage(
        EVENT_TYPES.BOOKING_STATUS_CHANGED,
        cancelledPayload,
        "Sporthalle Ost",
        "en",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Booking cancelled");
      expect(result!.body).toContain("cancelled");
      expect(result!.body).toContain("Doppelbelegung");
    });

    it("renders cancelled booking without reason", () => {
      const noReason = { venueName: "Sporthalle Ost", date: "2026-05-01" };
      const result = renderBookingMessage(
        EVENT_TYPES.BOOKING_STATUS_CHANGED,
        noReason,
        "Sporthalle Ost",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.body).toContain("storniert");
      expect(result!.body).not.toContain("(");
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

  describe("missing field fallbacks", () => {
    it("handles missing time fields in time-change variant", () => {
      const result = renderBookingMessage(
        EVENT_TYPES.BOOKING_STATUS_CHANGED,
        { venueName: "Halle", changeType: "time_change", newStartTime: "19:00" },
        "Halle",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Buchungszeit");
      expect(result!.body).not.toContain("undefined");
      // date fallback => empty string
      expect(result!.body).toContain("Halle am :");
    });

    it("handles missing time fields in time-change variant (English)", () => {
      const result = renderBookingMessage(
        EVENT_TYPES.BOOKING_STATUS_CHANGED,
        { venueName: "Halle", oldStartTime: "18:00" },
        "Halle",
        "en",
      );
      expect(result).not.toBeNull();
      expect(result!.title).toContain("Booking time changed");
      expect(result!.body).not.toContain("undefined");
    });

    it("handles missing date in time-change variant", () => {
      const result = renderBookingMessage(
        EVENT_TYPES.BOOKING_STATUS_CHANGED,
        {
          venueName: "Halle",
          oldStartTime: "18:00",
          oldEndTime: "20:00",
          newStartTime: "19:00",
          newEndTime: "21:00",
        },
        "Halle",
        "de",
      );
      expect(result).not.toBeNull();
      // date is missing so formatDate is not called, empty string used
      expect(result!.body).not.toContain("undefined");
    });

    it("handles missing date and reason in reconfirmation", () => {
      const result = renderBookingMessage(
        EVENT_TYPES.BOOKING_NEEDS_RECONFIRMATION,
        { venueName: "Halle" },
        "Halle",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.body).not.toContain("undefined");
      // reason fallback => no trailing text
      expect(result!.body).toContain("werden.");
    });

    it("handles missing date and reason in reconfirmation (English)", () => {
      const result = renderBookingMessage(
        EVENT_TYPES.BOOKING_NEEDS_RECONFIRMATION,
        { venueName: "Halle" },
        "Halle",
        "en",
      );
      expect(result).not.toBeNull();
      expect(result!.body).not.toContain("undefined");
      expect(result!.body).toContain("reconfirmation.");
    });

    it("handles missing venueName with ?? fallback", () => {
      const result = renderBookingMessage(
        EVENT_TYPES.BOOKING_CREATED,
        {},
        "entity",
        "de",
      );
      expect(result).not.toBeNull();
      expect(result!.body).toContain("?");
    });

    it("handles missing startTime and endTime in booking created", () => {
      const result = renderBookingMessage(
        EVENT_TYPES.BOOKING_CREATED,
        { venueName: "Halle", date: "2026-04-15" },
        "Halle",
        "en",
      );
      expect(result).not.toBeNull();
      expect(result!.body).not.toContain("undefined");
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
