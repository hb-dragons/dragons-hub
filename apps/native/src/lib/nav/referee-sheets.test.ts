import { beforeEach, describe, expect, it, vi } from "vitest";
import { router } from "expo-router";

import { openAssignRefereeSheet } from "@/lib/nav/referee-sheets";

/**
 * How the Officiating tab opens the referee-assignment sheet (issue #223).
 *
 * Same convention as the board's sheets (`board-sheets.ts`): the path and the
 * param names live in one module, so the screen that opens the sheet and the
 * route that reads it cannot disagree about them.
 */

const pushed = (): { pathname: string; params: Record<string, unknown> } => {
  const push = vi.mocked(router.push);
  expect(push).toHaveBeenCalledTimes(1);
  return push.mock.calls[0]![0] as { pathname: string; params: Record<string, unknown> };
};

describe("openAssignRefereeSheet", () => {
  beforeEach(() => {
    vi.mocked(router.push).mockClear();
  });

  it("opens the assignment sheet for a match's slot", () => {
    openAssignRefereeSheet(4711, 2);

    const { pathname, params } = pushed();
    expect(pathname).toBe("/referee-assign");
    expect(params).toEqual({ apiMatchId: 4711, slot: 2 });
  });

  // The federation keys assignment by the *federation's* match id, not by our
  // row id — the sheet posts straight to `/admin/referee/games/:id/assign`.
  it("passes the federation match id through untouched", () => {
    openAssignRefereeSheet(900123, 1);

    expect(pushed().params["apiMatchId"]).toBe(900123);
  });
});
