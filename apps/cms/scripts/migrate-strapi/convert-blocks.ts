import {
  convertHTMLToLexical,
  editorConfigFactory,
  type SanitizedServerEditorConfig,
} from "@payloadcms/richtext-lexical";
import { JSDOM } from "jsdom";
import { buildConfig } from "payload";
import type { DatabaseAdapterObj } from "payload";

export interface StrapiBlock {
  type: string;
  level?: number;
  format?: "ordered" | "unordered";
  url?: string;
  text?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  code?: boolean;
  image?: { id: number; alternativeText: string | null };
  children?: StrapiBlock[];
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

/** Text marks nest outward-in, matching how Strapi stores them on the leaf. */
function renderText(node: StrapiBlock): string {
  let html = escapeHtml(node.text ?? "");
  if (node.code === true) html = `<code>${html}</code>`;
  if (node.strikethrough === true) html = `<s>${html}</s>`;
  if (node.underline === true) html = `<u>${html}</u>`;
  if (node.italic === true) html = `<em>${html}</em>`;
  if (node.bold === true) html = `<strong>${html}</strong>`;
  return html;
}

function renderChildren(
  nodes: StrapiBlock[] | undefined,
  mediaMap: Map<number, number>,
  postSlug: string,
): string {
  return (nodes ?? []).map((node) => renderNode(node, mediaMap, postSlug)).join("");
}

function renderNode(node: StrapiBlock, mediaMap: Map<number, number>, postSlug: string): string {
  switch (node.type) {
    case "text":
      return renderText(node);
    case "paragraph":
      return `<p>${renderChildren(node.children, mediaMap, postSlug)}</p>`;
    case "heading": {
      // Strapi allows 1-6; clamp so a bad value cannot emit <h9>.
      const level = Math.min(Math.max(node.level ?? 2, 1), 6);
      return `<h${level}>${renderChildren(node.children, mediaMap, postSlug)}</h${level}>`;
    }
    case "link":
      return `<a href="${escapeHtml(node.url ?? "")}">${renderChildren(node.children, mediaMap, postSlug)}</a>`;
    case "list": {
      const tag = node.format === "ordered" ? "ol" : "ul";
      return `<${tag}>${renderChildren(node.children, mediaMap, postSlug)}</${tag}>`;
    }
    case "list-item":
      return `<li>${renderChildren(node.children, mediaMap, postSlug)}</li>`;
    case "quote":
      return `<blockquote>${renderChildren(node.children, mediaMap, postSlug)}</blockquote>`;
    case "code":
      return `<pre><code>${renderChildren(node.children, mediaMap, postSlug)}</code></pre>`;
    case "image": {
      const payloadId = node.image === undefined ? undefined : mediaMap.get(node.image.id);
      if (payloadId === undefined) {
        // A dangling image is dropped rather than emitted broken. Nothing
        // downstream can report it — the id is gone by the time the HTML
        // reaches Lexical — so it is named here or nowhere.
        console.warn(
          `convert-blocks: ${postSlug}: image (strapi file ${node.image?.id ?? "?"}) has no migrated media — dropped`,
        );
        return "";
      }
      // UploadNode.importDOM claims every <img>, but $convertUploadElement
      // (@payloadcms/richtext-lexical/features/upload/server/nodes/conversions)
      // only builds a real upload node when BOTH data-lexical-upload-id and
      // data-lexical-upload-relation-to are present; any other <img> falls
      // through to an empty "pending" node that references neither id. These
      // are exactly the two attributes UploadNode.exportDOM writes, so
      // emitting them round-trips the media relation instead of losing it.
      return `<img data-lexical-upload-id="${payloadId}" data-lexical-upload-relation-to="media" alt="${escapeHtml(node.image?.alternativeText ?? "")}" />`;
    }
    default: {
      // Nothing in the real corpus hits this. Keep the text rather than lose it.
      console.warn(
        `convert-blocks: ${postSlug}: unknown node type "${node.type}" — wrapped in a paragraph`,
      );
      // A leaf carrying `text` but no `children` is the whole reason this
      // fallback exists; renderChildren alone would return "" and drop it.
      const inner =
        node.children === undefined ? renderText(node) : renderChildren(node.children, mediaMap, postSlug);
      return `<p>${inner}</p>`;
    }
  }
}

export function strapiBlocksToHtml(
  blocks: StrapiBlock[],
  mediaMap: Map<number, number>,
  postSlug: string,
): string {
  return blocks.map((block) => renderNode(block, mediaMap, postSlug)).join("");
}

/**
 * convertHTMLToLexical (3.87.0) needs a SanitizedServerEditorConfig, which in
 * turn is derived from a full Payload SanitizedConfig — see
 * editorConfigFactory.default in @payloadcms/richtext-lexical. That config is
 * only consulted to resolve feature-level things (e.g. which collections
 * accept uploads); it is never used to reach a database here, so rather than
 * import the app's real payload.config.ts (which would couple this
 * migration script to src/ and to a live Postgres connection string), this
 * builds the smallest config Payload's types allow, with no collections and
 * a database adapter that is never initialized.
 */
const placeholderDb: DatabaseAdapterObj = {
  defaultIDType: "number",
  init: () => {
    throw new Error("convert-blocks: placeholder db adapter must never be initialized");
  },
};

let editorConfigPromise: Promise<SanitizedServerEditorConfig> | undefined;

function getEditorConfig(): Promise<SanitizedServerEditorConfig> {
  editorConfigPromise ??= (async () => {
    const config = await buildConfig({
      // Never persisted or checked against anything; only satisfies Payload's
      // config shape so sanitizeConfig can run.
      secret: "strapi-migration-html-to-lexical",
      db: placeholderDb,
      collections: [],
    });
    return editorConfigFactory.default({ config });
  })();
  return editorConfigPromise;
}

/** `postSlug` names the post in any warning this raises — see index.ts. */
export async function strapiBlocksToLexical(
  blocks: StrapiBlock[],
  mediaMap: Map<number, number>,
  postSlug: string,
): Promise<unknown> {
  const html = strapiBlocksToHtml(blocks, mediaMap, postSlug);
  const editorConfig = await getEditorConfig();
  return convertHTMLToLexical({ html, editorConfig, JSDOM });
}
