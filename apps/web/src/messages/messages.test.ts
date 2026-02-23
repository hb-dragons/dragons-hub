import { describe, expect, it } from "vitest";
import de from "./de.json";
import en from "./en.json";

function flatKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null) {
      return flatKeys(value as Record<string, unknown>, fullKey);
    }
    return [fullKey];
  });
}

describe("i18n messages", () => {
  it("German and English have the same keys", () => {
    const deKeys = flatKeys(de).sort();
    const enKeys = flatKeys(en).sort();
    expect(deKeys).toEqual(enKeys);
  });

  it("no empty translation values", () => {
    for (const [key, value] of Object.entries(de)) {
      expect(value, `de.json: "${key}" is empty`).not.toBe("");
    }
    for (const [key, value] of Object.entries(en)) {
      expect(value, `en.json: "${key}" is empty`).not.toBe("");
    }
  });
});
