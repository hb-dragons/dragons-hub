import { describe, expect, it, vi } from "vitest";

import fixtures from "./fixtures/posts.json" with { type: "json" };
import { strapiBlocksToHtml, strapiBlocksToLexical, type StrapiBlock } from "./convert-blocks";

const NO_MEDIA = new Map<number, number>();
/** Stands in for the post slug the migration passes through for warning labels. */
const POST = "test-post";

describe("strapiBlocksToHtml", () => {
  it("renders a paragraph", () => {
    const blocks = [
      { type: "paragraph", children: [{ type: "text", text: "Hallo" }] },
    ] as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, NO_MEDIA, POST)).toBe("<p>Hallo</p>");
  });

  it("keeps an empty paragraph, because it is the author's spacing", () => {
    const blocks = [{ type: "paragraph", children: [{ type: "text", text: "" }] }] as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, NO_MEDIA, POST)).toBe("<p></p>");
  });

  it("renders a heading at its level", () => {
    const blocks = [
      { type: "heading", level: 2, children: [{ type: "text", text: "Titel" }] },
    ] as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, NO_MEDIA, POST)).toBe("<h2>Titel</h2>");
  });

  it("renders marks", () => {
    const blocks = [
      {
        type: "paragraph",
        children: [
          { type: "text", text: "a", bold: true },
          { type: "text", text: "b", italic: true },
          { type: "text", text: "c", underline: true },
          { type: "text", text: "d", strikethrough: true },
          { type: "text", text: "e", code: true },
        ],
      },
    ] as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, NO_MEDIA, POST)).toBe(
      "<p><strong>a</strong><em>b</em><u>c</u><s>d</s><code>e</code></p>",
    );
  });

  it("renders a link", () => {
    const blocks = [
      {
        type: "paragraph",
        children: [
          {
            type: "link",
            url: "https://hbdragons.de",
            children: [{ type: "text", text: "Dragons" }],
          },
        ],
      },
    ] as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, NO_MEDIA, POST)).toBe(
      '<p><a href="https://hbdragons.de">Dragons</a></p>',
    );
  });

  it("renders both list kinds", () => {
    const blocks = [
      {
        type: "list",
        format: "unordered",
        children: [{ type: "list-item", children: [{ type: "text", text: "eins" }] }],
      },
      {
        type: "list",
        format: "ordered",
        children: [{ type: "list-item", children: [{ type: "text", text: "zwei" }] }],
      },
    ] as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, NO_MEDIA, POST)).toBe(
      "<ul><li>eins</li></ul><ol><li>zwei</li></ol>",
    );
  });

  it("renders quote and code", () => {
    const blocks = [
      { type: "quote", children: [{ type: "text", text: "zitat" }] },
      { type: "code", children: [{ type: "text", text: "x = 1" }] },
    ] as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, NO_MEDIA, POST)).toBe(
      "<blockquote>zitat</blockquote><pre><code>x = 1</code></pre>",
    );
  });

  it("maps an image to the attribute pair Payload's upload importer looks for", () => {
    const blocks = [
      { type: "image", image: { id: 7, alternativeText: "Banner" }, children: [] },
    ] as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, new Map([[7, 42]]), POST)).toBe(
      '<img data-lexical-upload-id="42" data-lexical-upload-relation-to="media" alt="Banner" />',
    );
  });

  it("drops an image whose file was not migrated, naming the post", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const blocks = [
      { type: "image", image: { id: 7, alternativeText: null }, children: [] },
    ] as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, NO_MEDIA, POST)).toBe("");
    expect(warn).toHaveBeenCalledWith(
      'convert-blocks: test-post: image (strapi file 7) has no migrated media — dropped',
    );
  });

  it("drops an image node that carries no image at all", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const blocks = [{ type: "image", children: [] }] as unknown as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, new Map([[7, 42]]), POST)).toBe("");
    expect(warn).toHaveBeenCalledWith(
      "convert-blocks: test-post: image (strapi file ?) has no migrated media — dropped",
    );
  });

  it("emits an empty alt when the image has no alternative text", () => {
    const blocks = [
      { type: "image", image: { id: 7, alternativeText: null }, children: [] },
    ] as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, new Map([[7, 42]]), POST)).toBe(
      '<img data-lexical-upload-id="42" data-lexical-upload-relation-to="media" alt="" />',
    );
  });

  it("escapes HTML so editor text cannot inject markup", () => {
    const blocks = [
      { type: "paragraph", children: [{ type: "text", text: "a < b & \"c\"" }] },
    ] as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, NO_MEDIA, POST)).toBe("<p>a &lt; b &amp; &quot;c&quot;</p>");
  });

  it("falls back to a paragraph for an unknown node type, naming the post", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const blocks = [
      { type: "mystery", children: [{ type: "text", text: "trotzdem" }] },
    ] as unknown as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, NO_MEDIA, POST)).toBe("<p>trotzdem</p>");
    expect(warn).toHaveBeenCalledWith(
      'convert-blocks: test-post: unknown node type "mystery" — wrapped in a paragraph',
    );
  });

  it("keeps the text of an unknown leaf node that has no children", () => {
    // The whole point of the fallback: renderChildren alone returns "" here,
    // so the text an editor wrote would vanish without a trace.
    const blocks = [{ type: "mystery", text: "nicht verlieren" }] as unknown as StrapiBlock[];
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(strapiBlocksToHtml(blocks, NO_MEDIA, POST)).toBe("<p>nicht verlieren</p>");
  });

  it("yields an empty paragraph for an unknown leaf with neither text nor children", () => {
    const blocks = [{ type: "mystery" }] as unknown as StrapiBlock[];
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(strapiBlocksToHtml(blocks, NO_MEDIA, POST)).toBe("<p></p>");
  });

  it("escapes the text of an unknown leaf node too", () => {
    const blocks = [{ type: "mystery", text: "a < b" }] as unknown as StrapiBlock[];
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(strapiBlocksToHtml(blocks, NO_MEDIA, POST)).toBe("<p>a &lt; b</p>");
  });
});

describe("strapiBlocksToLexical", () => {
  it("carries a migrated image through as a real Lexical upload node", async () => {
    const blocks = [
      { type: "image", image: { id: 7, alternativeText: "Banner" }, children: [] },
    ] as StrapiBlock[];

    const lexical = (await strapiBlocksToLexical(blocks, new Map([[7, 42]]), POST)) as {
      root: { children: Record<string, unknown>[] };
    };

    // UploadNode.importDOM claims every <img>, but $convertUploadElement only
    // builds a node that references a real document when both
    // data-lexical-upload-id and data-lexical-upload-relation-to are present —
    // anything else becomes an empty "pending" node pointing at nothing. This
    // pins the difference: relationTo/value present, `pending` absent. If a
    // Payload upgrade changes the attribute contract, this breaks loudly
    // rather than the migration silently writing imageless posts.
    expect(lexical.root.children).toHaveLength(1);
    const [imageNode] = lexical.root.children;
    expect(imageNode?.type).toBe("upload");
    expect(imageNode?.relationTo).toBe("media");
    expect(imageNode?.pending).toBeUndefined();
    // Read off an HTML attribute, so it arrives as a string; Payload coerces
    // it on write. Compared loosely on purpose — the pin is "it is media 42",
    // not which primitive type the importer happened to preserve.
    expect(String(imageNode?.value)).toBe("42");
  });
});

describe("real post fixtures", () => {
  it.each(fixtures.map((post) => [post.slug ?? "(no slug)", post] as const))(
    "%s survives conversion to Lexical with a root",
    async (_slug, post) => {
      const lexical = (await strapiBlocksToLexical(
        (post.content ?? []) as StrapiBlock[],
        NO_MEDIA,
        post.slug ?? POST,
      )) as { root: { children: unknown[] } };
      expect(lexical.root).toBeDefined();
      expect(Array.isArray(lexical.root.children)).toBe(true);
      // Every real post has content; `[]` would satisfy both assertions above
      // and hide total content loss (the exact silent-corruption shape this
      // suite exists to catch), so the corpus needs a non-empty check too.
      expect(lexical.root.children.length).toBeGreaterThan(0);
    },
  );

  it("keeps the heading and both links from the real corpus", () => {
    const html = fixtures
      .map((post) => strapiBlocksToHtml((post.content ?? []) as StrapiBlock[], NO_MEDIA, post.slug ?? POST))
      .join("");
    expect(html).toContain("<h");
    expect(html.match(/<a href=/g)).toHaveLength(2);
    expect(html).toContain("<strong>");
  });
});
