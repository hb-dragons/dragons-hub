import { describe, it, expect } from "vitest";
import { scanSourceForLiterals } from "./i18n-literal-scan.core.mjs";

describe("scanSourceForLiterals", () => {
  it("flags a hardcoded JSX text child", () => {
    const src = `export function C() { return <div>Loading…</div>; }`;
    const violations = scanSourceForLiterals(src, "C.tsx");
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ kind: "text", text: "Loading…" });
  });

  it("flags a hardcoded string wrapped in a JSX expression container", () => {
    const src = `export function C() { return <div>{"Search…"}</div>; }`;
    const violations = scanSourceForLiterals(src, "C.tsx");
    expect(violations).toHaveLength(1);
    expect(violations[0].text).toBe("Search…");
  });

  it("flags a hardcoded aria-label attribute", () => {
    const src = `export function C() { return <button aria-label="Delete Board" />; }`;
    const violations = scanSourceForLiterals(src, "C.tsx");
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ kind: "attribute:aria-label", text: "Delete Board" });
  });

  it("flags a hardcoded placeholder, title and alt", () => {
    const src = `export function C() {
      return (
        <div>
          <input placeholder="Search…" />
          <span title="Enqueued" />
          <img alt="Team logo" />
        </div>
      );
    }`;
    const violations = scanSourceForLiterals(src, "C.tsx");
    expect(violations.map((v) => v.kind).sort()).toEqual([
      "attribute:alt",
      "attribute:placeholder",
      "attribute:title",
    ]);
  });

  it("does not flag a translation call used as a JSX child", () => {
    const src = `export function C() { return <div>{t("someKey")}</div>; }`;
    const violations = scanSourceForLiterals(src, "C.tsx");
    expect(violations).toHaveLength(0);
  });

  it("does not flag a translation call used as an attribute value", () => {
    const src = `export function C() { return <button aria-label={t("delete")} />; }`;
    const violations = scanSourceForLiterals(src, "C.tsx");
    expect(violations).toHaveLength(0);
  });

  it("does not flag attributes outside the target accessible-name set", () => {
    const src = `export function C() { return <div className="flex items-center" data-testid="row" type="button" /> }`;
    const violations = scanSourceForLiterals(src, "C.tsx");
    expect(violations).toHaveLength(0);
  });

  it("does not flag whitespace or punctuation-only text", () => {
    const src = `export function C() { return <div> · — {" "} </div>; }`;
    const violations = scanSourceForLiterals(src, "C.tsx");
    expect(violations).toHaveLength(0);
  });

  it("does not flag numeric-only literals", () => {
    const src = `export function C() { return <div>{"42"}</div>; }`;
    const violations = scanSourceForLiterals(src, "C.tsx");
    expect(violations).toHaveLength(0);
  });

  it("reports 1-based line and column of the offending literal", () => {
    const src = `export function C() {\n  return <div>Bad</div>;\n}`;
    const violations = scanSourceForLiterals(src, "C.tsx");
    expect(violations[0].line).toBe(2);
    expect(violations[0].column).toBeGreaterThan(1);
  });
});
