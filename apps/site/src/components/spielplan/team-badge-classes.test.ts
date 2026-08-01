import { describe, expect, test } from "vitest";
import { COLOR_PRESET_KEYS, getColorPreset } from "@dragons/shared";
import { TEAM_BADGE_CLASSES, teamBadgeClassName } from "./team-badge-classes";

describe("TEAM_BADGE_CLASSES", () => {
  test("carries exactly the shared preset keys", () => {
    expect(Object.keys(TEAM_BADGE_CLASSES).sort()).toEqual(
      [...COLOR_PRESET_KEYS].sort(),
    );
  });

  test.each(COLOR_PRESET_KEYS.map((key) => [key]))(
    "the %s literal matches the shared preset class string",
    (key) => {
      expect(TEAM_BADGE_CLASSES[key]).toBe(getColorPreset(key).className);
    },
  );
});

describe("teamBadgeClassName", () => {
  test("resolves a configured preset key", () => {
    expect(teamBadgeClassName("teal", "Herren 1")).toBe(TEAM_BADGE_CLASSES.teal);
  });

  test("falls back to the shared name-hash preset when no key is set", () => {
    expect(teamBadgeClassName(null, "Damen 1")).toBe(
      getColorPreset(null, "Damen 1").className,
    );
  });

  test("treats an unknown key like a missing one", () => {
    expect(teamBadgeClassName("mint-shade", "U18")).toBe(
      getColorPreset(null, "U18").className,
    );
  });
});
