import { describe, expect, it, vi } from "vitest";

import fixtures from "./fixtures/posts.json" with { type: "json" };
import { strapiBlocksToHtml, strapiBlocksToLexical, type StrapiBlock } from "./convert-blocks";

const NO_MEDIA = new Map<number, number>();

describe("strapiBlocksToHtml", () => {
  it("renders a paragraph", () => {
    const blocks = [
      { type: "paragraph", children: [{ type: "text", text: "Hallo" }] },
    ] as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, NO_MEDIA)).toBe("<p>Hallo</p>");
  });

  it("keeps an empty paragraph, because it is the author's spacing", () => {
    const blocks = [{ type: "paragraph", children: [{ type: "text", text: "" }] }] as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, NO_MEDIA)).toBe("<p></p>");
  });

  it("renders a heading at its level", () => {
    const blocks = [
      { type: "heading", level: 2, children: [{ type: "text", text: "Titel" }] },
    ] as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, NO_MEDIA)).toBe("<h2>Titel</h2>");
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
    expect(strapiBlocksToHtml(blocks, NO_MEDIA)).toBe(
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
    expect(strapiBlocksToHtml(blocks, NO_MEDIA)).toBe(
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
    expect(strapiBlocksToHtml(blocks, NO_MEDIA)).toBe(
      "<ul><li>eins</li></ul><ol><li>zwei</li></ol>",
    );
  });

  it("renders quote and code", () => {
    const blocks = [
      { type: "quote", children: [{ type: "text", text: "zitat" }] },
      { type: "code", children: [{ type: "text", text: "x = 1" }] },
    ] as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, NO_MEDIA)).toBe(
      "<blockquote>zitat</blockquote><pre><code>x = 1</code></pre>",
    );
  });

  it("maps an image to its migrated media id", () => {
    const blocks = [
      { type: "image", image: { id: 7, alternativeText: "Banner" }, children: [] },
    ] as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, new Map([[7, 42]]))).toBe(
      '<img data-media-id="42" alt="Banner" />',
    );
  });

  it("drops an image whose file was not migrated", () => {
    const blocks = [
      { type: "image", image: { id: 7, alternativeText: null }, children: [] },
    ] as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, NO_MEDIA)).toBe("");
  });

  it("escapes HTML so editor text cannot inject markup", () => {
    const blocks = [
      { type: "paragraph", children: [{ type: "text", text: "a < b & \"c\"" }] },
    ] as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, NO_MEDIA)).toBe("<p>a &lt; b &amp; &quot;c&quot;</p>");
  });

  it("falls back to a paragraph for an unknown node type", () => {
    const blocks = [
      { type: "mystery", children: [{ type: "text", text: "trotzdem" }] },
    ] as unknown as StrapiBlock[];
    expect(strapiBlocksToHtml(blocks, NO_MEDIA)).toBe("<p>trotzdem</p>");
  });
});

describe("strapiBlocksToLexical", () => {
  it("warns that a migrated image cannot become a real Lexical upload node", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const blocks = [
      { type: "image", image: { id: 7, alternativeText: "Banner" }, children: [] },
    ] as StrapiBlock[];

    const lexical = (await strapiBlocksToLexical(blocks, new Map([[7, 42]]))) as {
      root: { children: Record<string, unknown>[] };
    };

    expect(warn).toHaveBeenCalledWith(
      "convert-blocks: image (strapi file 7 -> payload media 42) has no Lexical upload converter — re-attach manually after migration",
    );
    // Payload 3.87.0's HTML importer has no converter for a generic <img>, so
    // the mapped media id never reaches the Lexical tree: it comes out as an
    // empty "pending" upload node — one with no relationTo/value pair, which
    // is the field shape a real upload-to-media relation would use — rather
    // than one that actually relates to media doc 42. Asserted on the parsed
    // structure, not a substring of the serialized JSON: Lexical assigns
    // every node a random hex id/key, and "42" can land inside one by pure
    // chance (observed ~1-in-6 runs), which made a
    // JSON.stringify(lexical).includes("42") check flaky rather than a real
    // pin. Pin the shape instead, so a future Payload upgrade that adds a
    // real <img> converter breaks this test loudly instead of the gap
    // silently closing (or reopening) unnoticed.
    expect(lexical.root.children).toHaveLength(1);
    const [imageNode] = lexical.root.children;
    expect(imageNode?.type).toBe("upload");
    expect(imageNode?.pending).toBeDefined();
    expect(imageNode).not.toHaveProperty("relationTo");
    expect(imageNode).not.toHaveProperty("value");
  });
});

describe("real post fixtures", () => {
  it.each(fixtures.map((post) => [post.slug ?? "(no slug)", post] as const))(
    "%s survives conversion to Lexical with a root",
    async (_slug, post) => {
      const lexical = (await strapiBlocksToLexical(
        (post.content ?? []) as StrapiBlock[],
        NO_MEDIA,
      )) as { root: { children: unknown[] } };
      expect(lexical.root).toBeDefined();
      expect(Array.isArray(lexical.root.children)).toBe(true);
    },
  );

  it("keeps the heading and both links from the real corpus", () => {
    const html = fixtures
      .map((post) => strapiBlocksToHtml((post.content ?? []) as StrapiBlock[], NO_MEDIA))
      .join("");
    expect(html).toContain("<h");
    expect(html.match(/<a href=/g)).toHaveLength(2);
    expect(html).toContain("<strong>");
  });
});
