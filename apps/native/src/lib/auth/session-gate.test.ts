import { describe, expect, it } from "vitest";
import { sessionGateSettled } from "./session-gate";

/** Feeds a sequence of `isPending` values through the gate, render by render. */
function settledAfter(pendings: boolean[]): boolean[] {
  const out: boolean[] = [];
  let settled = false;
  for (const isPending of pendings) {
    settled = sessionGateSettled(settled, isPending);
    out.push(settled);
  }
  return out;
}

describe("sessionGateSettled", () => {
  it("holds the gate while the stored session is first being restored", () => {
    expect(settledAfter([true, true])).toEqual([false, false]);
  });

  it("opens once the first restore resolves", () => {
    expect(settledAfter([true, false])).toEqual([false, true]);
  });

  // The 1Password bug: signed out, the app comes back to the foreground after
  // the password manager hands over, better-auth refetches the session and
  // reports `isPending: true` again because there is no session data. The gate
  // must stay open, or the navigator unmounts and the sign-in sheet and its
  // filled fields are thrown away.
  it("stays open when a signed-out foreground refetch reports pending again", () => {
    expect(settledAfter([true, false, true, false])).toEqual([false, true, true, true]);
  });
});
