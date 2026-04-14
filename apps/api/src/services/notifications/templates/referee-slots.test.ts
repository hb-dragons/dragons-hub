import { describe, it, expect } from "vitest";
import { renderRefereeSlotsWhatsApp } from "./referee-slots";
import type { RefereeSlotsPayload } from "@dragons/shared";

const basePayload: RefereeSlotsPayload = {
  matchId: 42,
  matchNo: 1001,
  homeTeam: "Dragons U16",
  guestTeam: "TSV Neustadt",
  leagueId: 5,
  leagueName: "Kreisliga U16",
  kickoffDate: "2026-03-15",
  kickoffTime: "14:00",
  venueId: 10,
  venueName: "Sporthalle Musterstraße",
  sr1Open: true,
  sr2Open: true,
  sr1Assigned: null,
  sr2Assigned: null,
  deepLink: "/referee/matches?take=42",
};

describe("renderRefereeSlotsWhatsApp", () => {
  it("renders initial notification with both slots open", () => {
    const result = renderRefereeSlotsWhatsApp(basePayload, "https://app.dragons.de");
    expect(result).toContain("*Schiedsrichter gesucht!*");
    expect(result).toContain("Dragons U16 vs. TSV Neustadt");
    expect(result).toContain("15.03.2026");
    expect(result).toContain("14:00");
    expect(result).toContain("Sporthalle Musterstraße");
    expect(result).toContain("Kreisliga U16");
    expect(result).toContain("SR1: ❌ offen");
    expect(result).toContain("SR2: ❌ offen");
    expect(result).toContain("https://app.dragons.de/referee/matches?take=42");
  });

  it("renders reminder with one slot filled", () => {
    const payload: RefereeSlotsPayload = {
      ...basePayload,
      sr1Open: false,
      sr1Assigned: "Max Mustermann",
      reminderLevel: 3,
    };
    const result = renderRefereeSlotsWhatsApp(payload, "https://app.dragons.de");
    expect(result).toContain("*Noch ein Schiedsrichter benötigt!*");
    expect(result).toContain("SR1: ✅ Max Mustermann");
    expect(result).toContain("SR2: ❌ *offen*");
    expect(result).toContain("Spieltag in 3 Tagen!");
  });

  it("renders reminder with both slots open", () => {
    const payload: RefereeSlotsPayload = {
      ...basePayload,
      reminderLevel: 7,
    };
    const result = renderRefereeSlotsWhatsApp(payload, "https://app.dragons.de");
    expect(result).toContain("*Noch Schiedsrichter benötigt!*");
    expect(result).toContain("Spieltag in 7 Tagen!");
  });

  it("renders reminder with 1 day as singular", () => {
    const payload: RefereeSlotsPayload = {
      ...basePayload,
      reminderLevel: 1,
    };
    const result = renderRefereeSlotsWhatsApp(payload, "https://app.dragons.de");
    expect(result).toContain("Spieltag morgen!");
  });
});
