import { describe, it, expect } from "vitest";
import { scanSourceForLiterals, USER_FACING_CALL_RULES } from "./i18n-literal-scan.core.mjs";

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

describe("scanSourceForLiterals: allowlisted call arguments", () => {
  it("flags the first argument of a toast call", () => {
    const src = `onSave().catch(() => toast.error("Could not save the match"));`;
    const violations = scanSourceForLiterals(src, "save.ts");
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      kind: "call:toast.error",
      text: "Could not save the match",
    });
  });

  it("flags every toast method, including calling toast directly", () => {
    const src = `
      toast("Queued");
      toast.success("Saved");
      toast.warning("Partially sent");
      toast.message("Archiving lands soon");
    `;
    const violations = scanSourceForLiterals(src, "toasts.ts");
    expect(violations.map((v) => v.kind)).toEqual([
      "call:toast",
      "call:toast.success",
      "call:toast.warning",
      "call:toast.message",
    ]);
  });

  it("flags a description inside a toast options object", () => {
    const src = `toast.error("Sync failed", { description: "The federation rejected the request" });`;
    const violations = scanSourceForLiterals(src, "sync.ts");
    expect(violations.map((v) => [v.kind, v.text])).toEqual([
      ["call:toast.error", "Sync failed"],
      ["call:toast.error.description", "The federation rejected the request"],
    ]);
  });

  it("flags Zod size messages in the second argument", () => {
    const src = `const schema = z.object({
      name: z.string().min(3, "Name is too short"),
      bio: z.string().max(200, "Bio is too long"),
      pin: z.string().length(4, "PIN must be four digits"),
    });`;
    const violations = scanSourceForLiterals(src, "schema.ts");
    expect(violations.map((v) => v.kind)).toEqual(["call:min", "call:max", "call:length"]);
  });

  it("flags Zod format messages", () => {
    const src = `const schema = z.object({
      email: z.string().email("Not a valid address"),
      site: z.string().url("Not a valid link"),
      code: z.string().regex(/^[A-Z]+$/, "Letters only"),
    });`;
    const violations = scanSourceForLiterals(src, "schema.ts");
    expect(violations.map((v) => v.text)).toEqual([
      "Not a valid address",
      "Not a valid link",
      "Letters only",
    ]);
  });

  it("flags the { message } and { error } option forms", () => {
    const src = `const schema = z.object({
      name: z.string().min(3, { message: "Name is too short" }),
      email: z.string().email({ error: "Not a valid address" }),
    });`;
    const violations = scanSourceForLiterals(src, "schema.ts");
    expect(violations.map((v) => [v.kind, v.text])).toEqual([
      ["call:min.message", "Name is too short"],
      ["call:email.error", "Not a valid address"],
    ]);
  });

  it("flags a no-substitution template literal in an allowlisted position", () => {
    const src = "toast.error(`Could not reach the server`);";
    const violations = scanSourceForLiterals(src, "net.ts");
    expect(violations.map((v) => v.text)).toEqual(["Could not reach the server"]);
  });

  it("does not flag a translated toast or Zod message", () => {
    const src = `
      toast.error(t("matchDetail.toast.updateFailed"));
      toast.success(t("saved"), { description: t("savedDetail") });
      const schema = z.string().min(1, t("users.validation.nameRequired"));
    `;
    expect(scanSourceForLiterals(src, "translated.ts")).toHaveLength(0);
  });

  it("does not flag log messages, which are the same shape as a toast", () => {
    const src = `
      console.error("Failed to load the sync history");
      console.warn("Retrying");
      logger.error("sync stage crashed");
      log.info("worker booted", { description: "not a toast" });
    `;
    expect(scanSourceForLiterals(src, "log.ts")).toHaveLength(0);
  });

  it("does not flag internal keys, ids and non-user-facing constants", () => {
    const src = `
      const KEYS = ["boards", "list"];
      useTranslations("admin.matches");
      api.get("/api/sync/runs");
      screen.getByTestId("match-row");
      element.setAttribute("data-state", "open");
      const STATUS = { queued: "queued", running: "running" };
    `;
    expect(scanSourceForLiterals(src, "misc.ts")).toHaveLength(0);
  });

  it("does not flag a string argument in a call position outside the allowlist", () => {
    const src = `
      notifyUser("Your booking was declined");
      showError("Something went wrong");
      Sentry.captureMessage("Payment failed");
    `;
    expect(scanSourceForLiterals(src, "helpers.ts")).toHaveLength(0);
  });

  it("does not flag the non-message arguments of an allowlisted call", () => {
    const src = `const schema = z.string().min(3).max(200).regex(/^[a-z]+$/);`;
    expect(scanSourceForLiterals(src, "schema.ts")).toHaveLength(0);
  });

  it("does not flag options keys the rule does not name", () => {
    const src = `toast.error("x", { id: "save-toast", className: "border-danger", duration: 4000 });`;
    const violations = scanSourceForLiterals(src, "toast.ts");
    expect(violations.map((v) => v.kind)).toEqual(["call:toast.error"]);
  });

  it("reports a call-argument literal once, even when two rules could match it", () => {
    const src = `toast.min("Too short", { message: "Too short" });`;
    const violations = scanSourceForLiterals(src, "odd.ts");
    expect(violations.map((v) => v.kind)).toEqual(["call:toast.min", "call:toast.min.message"]);
  });

  it("finds allowlisted calls inside JSX handlers alongside JSX violations", () => {
    const src = `export function C() {
      return <button onClick={() => toast.error("Delete failed")}>Delete</button>;
    }`;
    const violations = scanSourceForLiterals(src, "C.tsx");
    expect(violations.map((v) => [v.kind, v.text])).toEqual([
      ["call:toast.error", "Delete failed"],
      ["text", "Delete"],
    ]);
  });
});

describe("USER_FACING_CALL_RULES", () => {
  it("is the single place callee names live, so adding one is a one-line change", () => {
    expect(USER_FACING_CALL_RULES.map((rule) => rule.id)).toEqual([
      "toast",
      "zod-size",
      "zod-format",
    ]);
    for (const rule of USER_FACING_CALL_RULES) {
      expect(rule.methods.length).toBeGreaterThan(0);
      expect(rule.messageArgs.length + rule.optionKeys.length).toBeGreaterThan(0);
    }
  });
});
