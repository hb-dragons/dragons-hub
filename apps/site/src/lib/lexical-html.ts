/**
 * Build-time Lexical → HTML conversion for post content (news detail pages).
 *
 * Wraps @payloadcms/richtext-lexical's `convertLexicalToHTML` with two
 * legacy-parity converters:
 * - links always open in a new tab (the legacy RichTextRenderer set
 *   target="_blank" on every link) — internal doc links keep the default
 *   converter since the site has no use for them;
 * - uploads render as the legacy <figure> block (full-width capped image,
 *   alt text as caption), with relative CMS media URLs resolved via
 *   {@link mediaUrl} exactly like every other image on the site.
 *
 * Typography (margins, sizes, link color) is applied by RichText.astro's
 * scoped styles — the emitted markup carries no per-node classes.
 */
import {
  convertLexicalToHTML,
  type HTMLConvertersFunction,
} from "@payloadcms/richtext-lexical/html";
import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";

import { mediaUrl } from "./media";

/** Matches the opaque `lexical` shape in content.config.ts. */
export interface LexicalContent {
  root: Record<string, unknown>;
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

interface UploadValue {
  url?: string | null;
  alt?: string | null;
  width?: number | null;
  height?: number | null;
}

export function lexicalToHtml(
  content: LexicalContent | null | undefined,
  cmsBase: string | undefined,
): string {
  if (content == null) return "";

  const converters: HTMLConvertersFunction = ({ defaultConverters }) => ({
    ...defaultConverters,
    link: (args) => {
      const { node, nodesToHTML } = args;
      if (node.fields.linkType === "internal") {
        // Fall through to the default converter for doc links.
        const defaultLink = defaultConverters.link;
        if (typeof defaultLink === "function") {
          return defaultLink(args);
        }
        return nodesToHTML({ nodes: node.children }).join("");
      }
      const children = nodesToHTML({ nodes: node.children }).join("");
      const href = escapeAttribute(node.fields.url ?? "");
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${children}</a>`;
    },
    upload: ({ node }) => {
      const value = node.value;
      // Numbers are unpopulated relations (past the populate depth) — nothing
      // renderable arrived, so render nothing rather than a broken image.
      if (typeof value !== "object" || value === null) return "";
      const { url, alt, width, height } = value as UploadValue;
      const src = mediaUrl(url, cmsBase);
      if (src == null || src === "") return "";
      const altAttr = escapeAttribute(alt ?? "");
      const dimensions =
        (width != null ? ` width="${width}"` : "") + (height != null ? ` height="${height}"` : "");
      const caption =
        alt != null && alt !== "" ? `<figcaption>${escapeAttribute(alt)}</figcaption>` : "";
      return (
        `<figure><img src="${escapeAttribute(src)}" alt="${altAttr}"${dimensions}` +
        ` loading="lazy" decoding="async" />${caption}</figure>`
      );
    },
  });

  return convertLexicalToHTML({
    converters,
    data: content as unknown as SerializedEditorState,
  });
}
