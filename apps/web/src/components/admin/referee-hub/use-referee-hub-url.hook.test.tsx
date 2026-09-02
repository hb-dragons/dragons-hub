// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

// The hook writes through the History API (which Next.js syncs into
// useSearchParams); here useSearchParams reads the location the writes land on.
vi.mock("next/navigation", () => ({
  usePathname: () => "/de/admin/referees",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

import { useRefereeHubUrl } from "./use-referee-hub-url";

const nav = { push: vi.spyOn(window.history, "pushState"), replace: vi.spyOn(window.history, "replaceState") };
const lastHref = (fn: { mock: { calls: unknown[][] } }) => fn.mock.calls.at(-1)?.[2] as string;
const query = (href: string) => new URLSearchParams(href.split("?")[1] ?? "");
const startAt = (qs: string) => window.history.replaceState(null, "", qs ? `/de/admin/referees?${qs}` : "/de/admin/referees");

beforeEach(() => { startAt(""); nav.push.mockClear(); nav.replace.mockClear(); });
afterEach(() => { cleanup(); });

describe("useRefereeHubUrl — history", () => {
  it("switching tab pushes a history entry so Back returns to the previous tab", () => {
    const { result } = renderHook(() => useRefereeHubUrl());
    act(() => result.current.update({ tab: "referees" }));
    expect(nav.push).toHaveBeenCalledTimes(1);
    expect(nav.replace).not.toHaveBeenCalled();
    expect(query(lastHref(nav.push)).get("tab")).toBe("referees");
  });

  it("selecting a game, a referee or a subtab pushes", () => {
    const { result } = renderHook(() => useRefereeHubUrl());
    act(() => result.current.update({ gameId: 4287 }));
    act(() => result.current.update({ tab: "referees", refereeId: 42 }));
    act(() => result.current.update({ subtab: "rules" }));
    expect(nav.push).toHaveBeenCalledTimes(3);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("filters, search, sort and scope replace in place so typing does not spam history", () => {
    const { result } = renderHook(() => useRefereeHubUrl());
    act(() => result.current.update({ filters: { status: "any" } }));
    act(() => result.current.update({ search: "mü" }));
    act(() => result.current.update({ sort: "workloadDesc" }));
    act(() => result.current.update({ scope: "all" }));
    expect(nav.replace).toHaveBeenCalledTimes(4);
    expect(nav.push).not.toHaveBeenCalled();
  });
});

describe("useRefereeHubUrl — state survives a tab round trip", () => {
  it("open-slots filters and selection stay in the URL while on the referees tab", () => {
    startAt("status=any&league=1,2&game=4287");
    const { result } = renderHook(() => useRefereeHubUrl());
    act(() => result.current.update({ tab: "referees" }));
    const q = query(lastHref(nav.push));
    expect(q.get("tab")).toBe("referees");
    expect(q.get("status")).toBe("any");
    expect(q.get("league")).toBe("1,2");
    expect(q.get("game")).toBe("4287");
  });

  it("referee search, sort, selection and subtab stay in the URL while on open slots", () => {
    startAt("tab=referees&id=42&subtab=rules&search=mei&sort=workloadDesc&scope=all");
    const { result } = renderHook(() => useRefereeHubUrl());
    act(() => result.current.update({ tab: "open-slots" }));
    const q = query(lastHref(nav.push));
    expect(q.get("tab")).toBeNull();
    expect(q.get("id")).toBe("42");
    expect(q.get("subtab")).toBe("rules");
    expect(q.get("search")).toBe("mei");
    expect(q.get("sort")).toBe("workloadDesc");
    expect(q.get("scope")).toBe("all");
  });

  it("a partial filters patch merges into the current filters", () => {
    startAt("league=7");
    const { result } = renderHook(() => useRefereeHubUrl());
    act(() => result.current.update({ filters: { status: "offered" } }));
    const q = query(lastHref(nav.replace));
    expect(q.get("status")).toBe("offered");
    expect(q.get("league")).toBe("7");
  });

  it("reads the latest URL, not a stale render, when two updates land back to back", () => {
    const { result } = renderHook(() => useRefereeHubUrl());
    // Same render's `update` used twice: the second must build on the first's
    // URL, the way a debounced search firing right after a click does.
    const { update } = result.current;
    act(() => { update({ tab: "referees", refereeId: 5 }); update({ search: "ab" }); });
    const q = query(lastHref(nav.replace));
    expect(q.get("id")).toBe("5");
    expect(q.get("search")).toBe("ab");
  });
});
