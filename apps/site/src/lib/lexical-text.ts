/**
 * Build-time Lexical → plain text, for auto-derived meta descriptions (plan
 * Task C8). Counterpart to lexical-html.ts: instead of markup it yields the
 * document's readable text — inline runs joined as written, block nodes
 * separated by a space, everything else (uploads, unknown nodes) skipped.
 */
import type { LexicalContent } from "./lexical-html";

/** Node types that end a run of inline text (a space belongs after them). */
const BLOCK_TYPES = new Set(["paragraph", "heading", "quote", "list", "listitem"]);

function textOf(node: Record<string, unknown>): string {
  if (typeof node.text === "string") return node.text;
  if (node.type === "linebreak") return " ";
  const children = Array.isArray(node.children) ? node.children : [];
  const inner = children
    .map((child) =>
      typeof child === "object" && child !== null
        ? textOf(child as Record<string, unknown>)
        : "",
    )
    .join("");
  return BLOCK_TYPES.has(node.type as string) ? `${inner} ` : inner;
}

/** The document's plain text with all whitespace collapsed to single spaces. */
export function lexicalToPlainText(content: LexicalContent | null | undefined): string {
  if (content == null) return "";
  return textOf(content.root).replace(/\s+/g, " ").trim();
}
