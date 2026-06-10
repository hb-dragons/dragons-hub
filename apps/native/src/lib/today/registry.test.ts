import { describe, expect, it, vi } from "vitest";
import type { GateUser, TodayItem } from "@dragons/shared";

const refItems: TodayItem[] = [
  { id: "r1", providerId: "referee", title: "ref", urgency: 80, route: "/officiating", icon: "whistle" },
];
const clubItems: TodayItem[] = [
  { id: "c1", providerId: "club", title: "club", urgency: 40, route: "/game/1", icon: "basketball" },
];

vi.mock("@/lib/today/providers/referee", () => ({
  refereeProvider: { id: "referee", visible: () => true, useItems: () => refItems },
}));
vi.mock("@/lib/today/providers/club", () => ({
  clubProvider: { id: "club", visible: () => true, useItems: () => clubItems },
}));

import { useTodayItems } from "@/lib/today/registry";

const user = { id: "u1" } as unknown as GateUser;

describe("useTodayItems", () => {
  it("aggregates visible providers ordered by urgency (desc)", () => {
    const items = useTodayItems(user);
    expect(items.map((i) => i.id)).toEqual(["r1", "c1"]);
  });
});
