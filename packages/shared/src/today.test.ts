import { describe, it, expect } from "vitest";
import { orderTodayItems, type TodayItem } from "./today";

const item = (over: Partial<TodayItem>): TodayItem => ({
  id: "x",
  providerId: "club",
  title: "t",
  urgency: 0,
  route: "/",
  icon: "circle",
  ...over,
});

describe("orderTodayItems", () => {
  it("returns empty for empty input", () => {
    expect(orderTodayItems([])).toEqual([]);
  });
  it("sorts by urgency descending", () => {
    const out = orderTodayItems([
      item({ id: "a", urgency: 1 }),
      item({ id: "b", urgency: 9 }),
    ]);
    expect(out.map((i) => i.id)).toEqual(["b", "a"]);
  });
  it("breaks ties by providerId then id, deterministically", () => {
    const out = orderTodayItems([
      item({ id: "2", providerId: "referee", urgency: 5 }),
      item({ id: "1", providerId: "referee", urgency: 5 }),
      item({ id: "9", providerId: "club", urgency: 5 }),
    ]);
    expect(out.map((i) => `${i.providerId}:${i.id}`)).toEqual([
      "club:9",
      "referee:1",
      "referee:2",
    ]);
  });
  it("does not mutate its input", () => {
    const input = [item({ id: "a", urgency: 1 }), item({ id: "b", urgency: 2 })];
    orderTodayItems(input);
    expect(input.map((i) => i.id)).toEqual(["a", "b"]);
  });
});
