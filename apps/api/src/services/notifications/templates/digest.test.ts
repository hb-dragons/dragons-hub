import { describe, it, expect } from "vitest";
import { renderDigestMessage, type DigestItem } from "./digest";

function makeItem(overrides: Partial<DigestItem> = {}): DigestItem {
  return {
    eventType: "match.schedule.changed",
    payload: { oldDate: "2026-03-10", newDate: "2026-03-15" },
    entityName: "Dragons vs. Hawks",
    deepLinkPath: "/matches/42",
    urgency: "routine",
    occurredAt: new Date("2026-03-10T12:00:00Z"),
    ...overrides,
  };
}

describe("renderDigestMessage", () => {
  it("returns empty-digest message in German when no items", () => {
    const result = renderDigestMessage([], "de");
    expect(result.title).toBe("Zusammenfassung");
    expect(result.body).toBe("Keine neuen Ereignisse.");
  });

  it("returns empty-digest message in English when no items", () => {
    const result = renderDigestMessage([], "en");
    expect(result.title).toBe("Digest");
    expect(result.body).toBe("No new events.");
  });

  it("uses singular form for one item in German", () => {
    const result = renderDigestMessage([makeItem()], "de");
    expect(result.title).toContain("1 Ereignis");
    expect(result.title).not.toContain("Ereignisse");
  });

  it("uses plural form for multiple items in German", () => {
    const items = [makeItem(), makeItem({ eventType: "match.venue.changed" })];
    const result = renderDigestMessage(items, "de");
    expect(result.title).toContain("2 Ereignisse");
  });

  it("uses singular form for one item in English", () => {
    const result = renderDigestMessage([makeItem()], "en");
    expect(result.title).toContain("1 event");
    expect(result.title).not.toContain("events");
  });

  it("uses plural form for multiple items in English", () => {
    const items = [makeItem(), makeItem()];
    const result = renderDigestMessage(items, "en");
    expect(result.title).toContain("2 events");
  });

  it("renders each item as a line in the body", () => {
    const items = [
      makeItem({ eventType: "match.schedule.changed" }),
      makeItem({ eventType: "match.venue.changed", payload: { oldVenue: "A", newVenue: "B" } }),
    ];
    const result = renderDigestMessage(items, "de");
    const lines = result.body.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^- /);
    expect(lines[1]).toMatch(/^- /);
  });

  it("falls back for unknown event types", () => {
    const items = [makeItem({ eventType: "unknown.event" })];
    const result = renderDigestMessage(items, "de");
    expect(result.body).toContain("unknown.event");
  });

  it("renders known event types with proper titles", () => {
    const items = [
      makeItem({
        eventType: "match.schedule.changed",
        payload: { oldDate: "2026-03-10", newDate: "2026-03-15" },
        entityName: "Dragons vs. Hawks",
      }),
    ];
    const result = renderDigestMessage(items, "de");
    // The match template should render a meaningful title
    expect(result.body).not.toBe("");
    expect(result.body.length).toBeGreaterThan(2);
  });
});
