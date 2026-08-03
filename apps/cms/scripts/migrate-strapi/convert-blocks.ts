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

function renderChildren(nodes: StrapiBlock[] | undefined, mediaMap: Map<number, number>): string {
  return (nodes ?? []).map((node) => renderNode(node, mediaMap)).join("");
}

function renderNode(node: StrapiBlock, mediaMap: Map<number, number>): string {
  switch (node.type) {
    case "text":
      return renderText(node);
    case "paragraph":
      return `<p>${renderChildren(node.children, mediaMap)}</p>`;
    case "heading": {
      // Strapi allows 1-6; clamp so a bad value cannot emit <h9>.
      const level = Math.min(Math.max(node.level ?? 2, 1), 6);
      return `<h${level}>${renderChildren(node.children, mediaMap)}</h${level}>`;
    }
    case "link":
      return `<a href="${escapeHtml(node.url ?? "")}">${renderChildren(node.children, mediaMap)}</a>`;
    case "list": {
      const tag = node.format === "ordered" ? "ol" : "ul";
      return `<${tag}>${renderChildren(node.children, mediaMap)}</${tag}>`;
    }
    case "list-item":
      return `<li>${renderChildren(node.children, mediaMap)}</li>`;
    case "quote":
      return `<blockquote>${renderChildren(node.children, mediaMap)}</blockquote>`;
    case "code":
      return `<pre><code>${renderChildren(node.children, mediaMap)}</code></pre>`;
    case "image": {
      const payloadId = node.image === undefined ? undefined : mediaMap.get(node.image.id);
      // A dangling image is dropped rather than emitted broken; index.ts logs it.
      if (payloadId === undefined) return "";
      // Payload 3.87.0's Lexical HTML importer has no converter for a plain
      // <img> (let alone one keyed on this custom data-media-id attribute),
      // so this mapping is lost the moment strapiBlocksToLexical runs the
      // HTML through convertHTMLToLexical — verified empirically, it comes
      // out as an empty "pending" upload node with no reference to either
      // id. Warn loudly so an operator running the migration knows which
      // post needs the image re-attached by hand.
      console.warn(
        `convert-blocks: image (strapi file ${node.image?.id} -> payload media ${payloadId}) has no Lexical upload converter — re-attach manually after migration`,
      );
      return `<img data-media-id="${payloadId}" alt="${escapeHtml(node.image?.alternativeText ?? "")}" />`;
    }
    default:
      // Nothing in the real corpus hits this. Keep the text rather than lose it.
      console.warn(`convert-blocks: unknown node type "${node.type}" — wrapped in a paragraph`);
      return `<p>${renderChildren(node.children, mediaMap)}</p>`;
  }
}

export function strapiBlocksToHtml(
  blocks: StrapiBlock[],
  mediaMap: Map<number, number>,
): string {
  return blocks.map((block) => renderNode(block, mediaMap)).join("");
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

export async function strapiBlocksToLexical(
  blocks: StrapiBlock[],
  mediaMap: Map<number, number>,
): Promise<unknown> {
  const html = strapiBlocksToHtml(blocks, mediaMap);
  const editorConfig = await getEditorConfig();
  return convertHTMLToLexical({ html, editorConfig, JSDOM });
}
