import { describe, expect, it } from "vitest";
import { signInExit, type NavState } from "./sign-in-exit";

const FAN_TABS = ["(home)", "schedule", "standings", "teams"];
const STAFF_TABS = ["(home)", "schedule", "officiating", "today", "teams"];

function root(tabs: NavState | undefined): NavState {
  return {
    key: "root",
    index: 1,
    routeNames: ["(tabs)", "(auth)"],
    routes: [{ name: "(tabs)", state: tabs }, { name: "(auth)" }],
  };
}

function tabs(routeNames: string[], focused: string): NavState {
  return {
    key: "tabs-1",
    index: routeNames.indexOf(focused),
    routeNames,
    routes: routeNames.map((name) => ({ name })),
  };
}

describe("signInExit", () => {
  it.each<[string, NavState | undefined]>([
    ["no navigation state yet", undefined],
    ["no tabs under the sheet (cold deep link)", { key: "root", index: 0, routes: [{ name: "(auth)" }] }],
    ["tabs not mounted under the sheet", root(undefined)],
    ["tabs still showing the fan set", root(tabs(FAN_TABS, "(home)"))],
    ["tabs state with no key to target", root({ ...tabs(STAFF_TABS, "(home)"), key: undefined })],
  ])("waits while there is %s", (_case, state) => {
    expect(signInExit(state)).toEqual({ kind: "wait" });
  });

  it("switches the tabs under the sheet to Today, aimed at that navigator", () => {
    expect(signInExit(root(tabs(STAFF_TABS, "(home)")))).toEqual({
      kind: "jump",
      action: { type: "JUMP_TO", target: "tabs-1", payload: { name: "today" } },
    });
  });

  it("closes the sheet once Today is the focused tab underneath", () => {
    expect(signInExit(root(tabs(STAFF_TABS, "today")))).toEqual({ kind: "dismiss" });
  });
});
