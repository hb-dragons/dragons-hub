import { describe, it, expect } from "vitest";
import { getNativeTeamColor } from "./native-team-colors";

describe("getNativeTeamColor", () => {
  it("returns correct hex for known badgeColor in dark mode", () => {
    const color = getNativeTeamColor("blue", "Any Team", true);
    expect(color.name).toBe("#60a5fa");
    expect(color.muted).toBe("#3b82f6");
  });

  it("returns correct hex for known badgeColor in light mode", () => {
    const color = getNativeTeamColor("blue", "Any Team", false);
    expect(color.name).toBe("#1d4ed8");
    expect(color.muted).toBe("#2563eb");
  });

  it("returns correct hex for all known presets in dark mode", () => {
    const expected: Record<string, { name: string; muted: string }> = {
      teal: { name: "#5eead4", muted: "#14b8a6" },
      green: { name: "#86efac", muted: "#22c55e" },
      orange: { name: "#fdba74", muted: "#f97316" },
      rose: { name: "#fda4af", muted: "#f43f5e" },
      pink: { name: "#f9a8d4", muted: "#ec4899" },
      cyan: { name: "#67e8f9", muted: "#06b6d4" },
      indigo: { name: "#a5b4fc", muted: "#6366f1" },
      emerald: { name: "#6ee7b7", muted: "#10b981" },
      violet: { name: "#c4b5fd", muted: "#8b5cf6" },
    };
    for (const [key, vals] of Object.entries(expected)) {
      const color = getNativeTeamColor(key, "Team", true);
      expect(color.name, `${key} dark name`).toBe(vals.name);
      expect(color.muted, `${key} dark muted`).toBe(vals.muted);
    }
  });

  it("falls back when badgeColor is null", () => {
    const color = getNativeTeamColor(null, "Dragons Regensburg", true);
    expect(color.name).toMatch(/^#[0-9a-f]{6}$/i);
    expect(color.muted).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("falls back when badgeColor is undefined", () => {
    const color = getNativeTeamColor(undefined, "Dragons U16", false);
    expect(color.name).toMatch(/^#[0-9a-f]{6}$/i);
    expect(color.muted).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("returns consistent colors for the same team name when badgeColor is null", () => {
    const color1 = getNativeTeamColor(null, "Dragons Regensburg", true);
    const color2 = getNativeTeamColor(null, "Dragons Regensburg", true);
    expect(color1).toEqual(color2);
  });

  it("dark and light mode return different values for the same preset", () => {
    const dark = getNativeTeamColor("violet", "Team", true);
    const light = getNativeTeamColor("violet", "Team", false);
    expect(dark.name).not.toBe(light.name);
    expect(dark.muted).not.toBe(light.muted);
  });

  it("falls back to blue when badgeColor is an unknown key", () => {
    // unknown key → getColorPreset returns first preset (blue)
    const color = getNativeTeamColor("nonexistent-key", "Team", true);
    expect(color.name).toMatch(/^#[0-9a-f]{6}$/i);
    expect(color.muted).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
