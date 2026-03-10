import { describe, it, expect } from "vitest";
import {
  COLOR_PRESETS,
  getColorPreset,
  COLOR_PRESET_KEYS,
} from "./team-colors";

describe("team-colors", () => {
  it("has 10 color presets", () => {
    expect(COLOR_PRESET_KEYS).toHaveLength(10);
  });

  it("returns the correct preset for a known key", () => {
    const preset = getColorPreset("blue");
    expect(preset).toBeDefined();
    expect(preset.dot).toBeDefined();
    expect(preset.light.bg).toContain("blue");
    expect(preset.dark.bg).toContain("blue");
  });

  it("falls back to the first preset for an unknown key", () => {
    const preset = getColorPreset("nonexistent");
    const firstKey = COLOR_PRESET_KEYS[0]!;
    expect(preset).toEqual(COLOR_PRESETS[firstKey]);
  });

  it("falls back to a hash-based preset for null key with teamName", () => {
    const preset1 = getColorPreset(null, "Team A");
    const preset2 = getColorPreset(null, "Team A");
    expect(preset1).toEqual(preset2);

    const preset3 = getColorPreset(null, "Team B");
    expect(COLOR_PRESET_KEYS).toContain(
      COLOR_PRESET_KEYS.find((k) => COLOR_PRESETS[k] === preset3)
    );
  });

  it("each preset has light and dark mode classes and a dot color", () => {
    for (const key of COLOR_PRESET_KEYS) {
      const preset = COLOR_PRESETS[key]!;
      expect(preset.light.bg).toBeTruthy();
      expect(preset.light.border).toBeTruthy();
      expect(preset.light.text).toBeTruthy();
      expect(preset.dark.bg).toBeTruthy();
      expect(preset.dark.border).toBeTruthy();
      expect(preset.dark.text).toBeTruthy();
      expect(preset.dot).toBeTruthy();
    }
  });
});
