// Static scanner for hardcoded user-facing text in JSX.
//
// `pnpm check:i18n` (apps/web's `i18n:check` script) previously only ran
// `@lingual/i18n-check`, which diffs the DE/EN message catalogs against each
// other for key parity. That structurally cannot see a string that never
// reached a catalog in the first place — a component can hardcode
// `<span>Loading…</span>` or `aria-label="Delete Board"` forever and every
// catalog-parity check stays green. This scanner closes that hole by parsing
// JSX and flagging literal, letter-containing text used as:
//   - JSX children (`<div>Hello</div>` or `<div>{"Hello"}</div>`)
//   - a handful of accessible-name-bearing attributes (`aria-label`,
//     `title`, `placeholder`, `alt`) when assigned a plain string literal
//
// It intentionally ignores every other attribute (className, variant, type,
// data-testid, …) to avoid drowning in non-user-facing noise, and it ignores
// `attr={t("key")}` / `{t("key")}` call expressions, which are exactly the
// translated form we want people to use instead.
import ts from "typescript";

export const TARGET_ATTRIBUTES = new Set(["aria-label", "title", "placeholder", "alt"]);

const LETTER_RE = /\p{L}/u;

function hasLetters(value) {
  return LETTER_RE.test(value);
}

/**
 * @param {string} sourceText
 * @param {string} fileName - used only to pick TS vs TSX grammar; doesn't need to exist on disk
 * @returns {{ line: number, column: number, kind: string, text: string }[]}
 */
export function scanSourceForLiterals(sourceText, fileName) {
  const scriptKind = fileName.endsWith(".tsx") || fileName.endsWith(".jsx")
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;

  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );

  const violations = [];

  function pushViolation(node, text, kind) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    violations.push({ line: line + 1, column: character + 1, kind, text: text.trim() });
  }

  function visit(node) {
    if (ts.isJsxText(node)) {
      if (hasLetters(node.text)) {
        pushViolation(node, node.text, "text");
      }
    } else if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sourceFile);
      if (TARGET_ATTRIBUTES.has(name) && node.initializer) {
        const init = node.initializer;
        if (ts.isStringLiteral(init) && hasLetters(init.text)) {
          pushViolation(init, init.text, `attribute:${name}`);
        } else if (
          ts.isJsxExpression(init) &&
          init.expression &&
          (ts.isStringLiteral(init.expression) || ts.isNoSubstitutionTemplateLiteral(init.expression)) &&
          hasLetters(init.expression.text)
        ) {
          pushViolation(init.expression, init.expression.text, `attribute:${name}`);
        }
      }
    } else if (
      ts.isJsxExpression(node) &&
      node.expression &&
      (ts.isStringLiteral(node.expression) || ts.isNoSubstitutionTemplateLiteral(node.expression)) &&
      hasLetters(node.expression.text) &&
      node.parent &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
    ) {
      pushViolation(node.expression, node.expression.text, "text");
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return violations;
}
