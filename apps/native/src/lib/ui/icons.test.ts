import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ICONS } from "@/lib/ui/icons";
import { SOURCE_FILES, rel } from "../../../test/source-tree";

const entries = Object.entries(ICONS);

describe("ICONS", () => {
  // ADR 0001: iOS gets the platform idiom, Android takes the plainest
  // acceptable fallback. `SymbolView` renders nothing at all on Android for a
  // name it was given no `android` key for, so an iOS-only entry is not a
  // degraded icon, it is a missing one.
  it("names both tiers for every role", () => {
    for (const [role, symbol] of entries) {
      expect(symbol.ios, `${role}.ios`).toBeTruthy();
      expect(symbol.android, `${role}.android`).toBeTruthy();
    }
  });

  // The two catalogues overlap on names that are legal in both — "checklist"
  // exists as an SF Symbol *and* as a Material symbol — so the compiler
  // cannot catch the two slots being filled from the wrong catalogue.
  // Their spelling conventions do differ: SF Symbols are dot-separated,
  // Material symbols are snake_case.
  it("spells each tier in its own catalogue's convention", () => {
    for (const [role, symbol] of entries) {
      expect(symbol.ios, `${role}.ios is not an SF Symbol name`).toMatch(
        /^[a-z0-9]+(\.[a-z0-9]+)*$/,
      );
      expect(symbol.android, `${role}.android is not a Material symbol name`).toMatch(
        /^[a-z0-9]+(_[a-z0-9]+)*$/,
      );
    }
  });

  it("gives each role its own symbol", () => {
    const pairs = entries.map(([, symbol]) => `${symbol.ios}/${symbol.android}`);
    expect(new Set(pairs).size, "two roles draw the same symbol").toBe(pairs.length);
  });

  // The registry is the app's icon vocabulary, not a catalogue of symbols we
  // might want one day: a role nothing renders is a name nobody has to keep
  // honest. `<Icon name="...">` is compile-checked in the other direction.
  //
  // Textual, so it reads a role's name where it is written — `name="add"`, or
  // `name={busy ? "stop" : "send"}` — rather than where it is rendered.
  it("keeps no role the app never renders", () => {
    const sources = SOURCE_FILES.filter((file) => rel(file) !== "src/lib/ui/icons.ts").map((file) =>
      readFileSync(file, "utf8"),
    );
    const unused = entries
      .map(([role]) => role)
      .filter((role) => {
        const named = new RegExp(String.raw`name=\{?[^\n]*"${role}"`);
        return !sources.some((source) => named.test(source));
      });
    expect(unused).toEqual([]);
  });
});
