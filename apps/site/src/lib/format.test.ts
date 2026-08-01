import { describe, expect, it } from "vitest";

import { formatDateDe, formatFileSize, formatMimeType, formatPrice } from "./format";

describe("formatFileSize", () => {
  it("renders 0 as 0 KB", () => {
    expect(formatFileSize(0)).toBe("0 KB");
  });

  it("renders sub-kilobyte sizes in KB", () => {
    expect(formatFileSize(512)).toBe("0.5 KB");
  });

  it("renders exact kilobytes", () => {
    expect(formatFileSize(1024)).toBe("1 KB");
  });

  it("renders kilobyte sizes with two decimals, trailing zeros trimmed", () => {
    expect(formatFileSize(302786)).toBe("295.69 KB");
  });

  it("renders megabytes", () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5 MB");
  });

  it("renders gigabytes", () => {
    expect(formatFileSize(1.5 * 1024 * 1024 * 1024)).toBe("1.5 GB");
  });

  it("caps at GB for absurd sizes", () => {
    expect(formatFileSize(3 * 1024 ** 4)).toBe("3072 GB");
  });
});

describe("formatMimeType", () => {
  it("maps the Word mime to DOCX", () => {
    expect(
      formatMimeType("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ).toBe("DOCX");
  });

  it("maps the Excel mime to XLSX", () => {
    expect(
      formatMimeType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    ).toBe("XLSX");
  });

  it("uses the uppercased subtype otherwise", () => {
    expect(formatMimeType("application/pdf")).toBe("PDF");
    expect(formatMimeType("image/webp")).toBe("WEBP");
  });

  it("falls back to FILE without a subtype", () => {
    expect(formatMimeType("weird")).toBe("FILE");
  });
});

describe("formatDateDe", () => {
  it("renders a long German date", () => {
    expect(formatDateDe(new Date("2025-09-01T10:00:00.000Z"))).toBe("1. September 2025");
  });

  it("uses German month names", () => {
    expect(formatDateDe(new Date("2026-03-15T10:00:00.000Z"))).toBe("15. März 2026");
  });
});

describe("formatPrice", () => {
  it("returns null for nullish or blank prices", () => {
    expect(formatPrice(null)).toBeNull();
    expect(formatPrice(undefined)).toBeNull();
    expect(formatPrice("  ")).toBeNull();
  });

  it("formats dot-decimal numeric strings as German EUR", () => {
    expect(formatPrice("38.34")).toBe("38,34 €");
  });

  it("formats comma-decimal numeric strings as German EUR", () => {
    expect(formatPrice("21,74")).toBe("21,74 €");
  });

  it("formats integer strings as German EUR", () => {
    expect(formatPrice("24")).toBe("24,00 €");
  });

  it("passes non-numeric prices through untouched", () => {
    expect(formatPrice("ab 20 €")).toBe("ab 20 €");
  });
});
