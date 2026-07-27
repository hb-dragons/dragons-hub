// Static scanner for hardcoded user-facing text in web source.
//
// `pnpm check:i18n` (apps/web's `i18n:check` script) previously only ran
// `@lingual/i18n-check`, which diffs the DE/EN message catalogs against each
// other for key parity. That structurally cannot see a string that never
// reached a catalog in the first place — a component can hardcode
// `<span>Loading…</span>` or `aria-label="Delete Board"` forever and every
// catalog-parity check stays green. This scanner closes that hole by parsing
// the file and flagging literal, letter-containing text used as:
//   - JSX children (`<div>Hello</div>` or `<div>{"Hello"}</div>`)
//   - a handful of accessible-name-bearing attributes (`aria-label`,
//     `title`, `placeholder`, `alt`) when assigned a plain string literal
//   - an argument in one of the call positions listed in
//     `USER_FACING_CALL_RULES` below
//
// It intentionally ignores every other attribute (className, variant, type,
// data-testid, …) to avoid drowning in non-user-facing noise, and it ignores
// `attr={t("key")}` / `{t("key")}` call expressions, which are exactly the
// translated form we want people to use instead.
//
// Scope decision (issue #135): call arguments are matched against an
// *allowlist*, never inferred. "Is this string argument user-facing?" has no
// general answer a parser can reach — `logger.error("sync failed")` and
// `toast.error("Sync failed")` are the same shape — so trying to infer it
// floods the report with log lines, query keys and internal ids, and a check
// nobody trusts gets suppressed. An allowlist of callee patterns plus argument
// positions gives up completeness for a near-zero false-positive rate, which
// is what keeps the baseline ratchet usable.
//
// The initial list is toasts and Zod validation messages: the strings a user
// reads at the moment something goes wrong. Widening it — repo-local error or
// notification helpers, for instance — is deliberately a one-line addition to
// the data below and nothing else; no callee name appears anywhere in the
// traversal.
import ts from "typescript";

export const TARGET_ATTRIBUTES = new Set(["aria-label", "title", "placeholder", "alt"]);

/**
 * One allowlisted family of calls whose string arguments reach the user.
 *
 * @typedef {object} UserFacingCallRule
 * @property {string} id           Human label for the family; appears in no output, it documents the entry.
 * @property {string} [receiver]   Identifier the method is called on (`toast` in `toast.error(…)`).
 *                                 Omit to match the method on any receiver, which is what Zod needs —
 *                                 `z.string().min(…)` is called on a call expression, not a name.
 * @property {string[]} methods    Method names to match, or `["*"]` for every method on `receiver`
 *                                 (`["*"]` also matches calling the receiver itself, e.g. `toast("…")`).
 * @property {number[]} messageArgs Positional argument indexes whose string literal is user-facing.
 * @property {string[]} optionKeys Property names whose string value is user-facing, read from any
 *                                 object-literal argument of a matched call.
 */

/**
 * The allowlist. Adding a callee is one entry here; the traversal reads it as data.
 *
 * @type {UserFacingCallRule[]}
 */
export const USER_FACING_CALL_RULES = [
  {
    // sonner: `toast("…")`, `toast.error("…")`, `toast.success("…", { description: "…" })`.
    // Every method is in scope — the whole surface renders its first argument to the screen.
    id: "toast",
    receiver: "toast",
    methods: ["*"],
    messageArgs: [0],
    optionKeys: ["description"],
  },
  {
    // Zod size checks: `.min(3, "Too short")`, `.max(20, { message: "Too long" })`.
    id: "zod-size",
    methods: ["min", "max", "length"],
    messageArgs: [1],
    optionKeys: ["message", "error"],
  },
  {
    // Zod format checks: `.email("Not a valid address")`, `.url({ error: "…" })`.
    // `.regex(pattern, "…")` puts its message second, so both positions are listed;
    // index 0 of `.regex` is a RegExp, never a string literal, so it costs nothing.
    id: "zod-format",
    methods: ["email", "url", "regex"],
    messageArgs: [0, 1],
    optionKeys: ["message", "error"],
  },
];

const LETTER_RE = /\p{L}/u;

function hasLetters(value) {
  return LETTER_RE.test(value);
}

/** @returns {ts.StringLiteral | ts.NoSubstitutionTemplateLiteral | null} */
function asPlainStringLiteral(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node;
  return null;
}

/**
 * Reduce a call's callee to the two things the allowlist matches on.
 * Returns null for shapes no rule can describe (element access, `super()`, …).
 */
function describeCallee(expression) {
  if (ts.isPropertyAccessExpression(expression)) {
    const receiver = ts.isIdentifier(expression.expression) ? expression.expression.text : null;
    const method = expression.name.text;
    return { receiver, method, label: receiver ? `${receiver}.${method}` : method };
  }
  if (ts.isIdentifier(expression)) {
    return { receiver: expression.text, method: null, label: expression.text };
  }
  return null;
}

function ruleMatches(rule, callee) {
  if (rule.receiver !== undefined && callee.receiver !== rule.receiver) return false;
  if (rule.methods.includes("*")) return true;
  return callee.method !== null && rule.methods.includes(callee.method);
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
  const reportedPositions = new Set();

  function pushViolation(node, text, kind) {
    const start = node.getStart(sourceFile);
    if (reportedPositions.has(start)) return;
    reportedPositions.add(start);
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(start);
    violations.push({ line: line + 1, column: character + 1, kind, text: text.trim() });
  }

  function visitCall(node) {
    const callee = describeCallee(node.expression);
    if (!callee) return;

    for (const rule of USER_FACING_CALL_RULES) {
      if (!ruleMatches(rule, callee)) continue;

      for (const index of rule.messageArgs) {
        const literal = asPlainStringLiteral(node.arguments[index]);
        if (literal && hasLetters(literal.text)) {
          pushViolation(literal, literal.text, `call:${callee.label}`);
        }
      }

      if (rule.optionKeys.length === 0) continue;

      for (const argument of node.arguments) {
        if (!ts.isObjectLiteralExpression(argument)) continue;
        for (const property of argument.properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          const key = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
            ? property.name.text
            : null;
          if (key === null || !rule.optionKeys.includes(key)) continue;
          const literal = asPlainStringLiteral(property.initializer);
          if (literal && hasLetters(literal.text)) {
            pushViolation(literal, literal.text, `call:${callee.label}.${key}`);
          }
        }
      }
    }
  }

  function visit(node) {
    if (ts.isCallExpression(node)) {
      visitCall(node);
    }

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
