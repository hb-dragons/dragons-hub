import { describe, expect, it } from "vitest";

import { lexicalToHtml } from "./lexical-html";

const editorState = (children: unknown[]) => ({
  root: {
    type: "root",
    children,
    direction: "ltr",
    format: "",
    indent: 0,
    version: 1,
  } as unknown as Record<string, unknown>,
});

const text = (t: string) => ({
  type: "text",
  text: t,
  detail: 0,
  format: 0,
  mode: "normal",
  style: "",
  version: 1,
});

const paragraph = (children: unknown[]) => ({
  type: "paragraph",
  children,
  direction: "ltr",
  format: "",
  indent: 0,
  textFormat: 0,
  version: 1,
});

describe("lexicalToHtml", () => {
  it("returns an empty string for missing content", () => {
    expect(lexicalToHtml(null, undefined)).toBe("");
    expect(lexicalToHtml(undefined, "http://cms")).toBe("");
  });

  it("converts paragraphs and headings", () => {
    const html = lexicalToHtml(
      editorState([
        { type: "heading", tag: "h2", children: [text("Titel")], direction: "ltr", format: "", indent: 0, version: 1 },
        paragraph([text("Hallo Dragons")]),
      ]),
      undefined,
    );
    expect(html).toContain("<h2");
    expect(html).toContain("Titel");
    expect(html).toContain("<p");
    expect(html).toContain("Hallo Dragons");
  });

  it("renders links opening in a new tab", () => {
    const html = lexicalToHtml(
      editorState([
        paragraph([
          {
            type: "link",
            children: [text("Ball Like A Girl")],
            fields: { linkType: "custom", url: "https://example.org/", newTab: false },
            direction: "ltr",
            format: "",
            indent: 0,
            version: 3,
          },
        ]),
      ]),
      undefined,
    );
    expect(html).toContain('href="https://example.org/"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Ball Like A Girl");
  });

  it("renders internal links through the default converter untouched", () => {
    const html = lexicalToHtml(
      editorState([
        paragraph([
          {
            type: "link",
            children: [text("intern")],
            fields: { linkType: "internal", doc: { value: 1, relationTo: "posts" } },
            direction: "ltr",
            format: "",
            indent: 0,
            version: 3,
          },
        ]),
      ]),
      undefined,
    );
    expect(html).toContain("intern");
    expect(html).not.toContain('target="_blank"');
  });

  it("renders populated uploads as figures with the CMS base prefixed", () => {
    const html = lexicalToHtml(
      editorState([
        {
          type: "upload",
          relationTo: "media",
          value: {
            id: 7,
            url: "/api/media/file/foto.webp",
            alt: 'Sommer "Camp"',
            width: 1920,
            height: 1280,
          },
          fields: null,
          format: "",
          version: 3,
        },
      ]),
      "http://localhost:3011",
    );
    expect(html).toContain("<figure");
    expect(html).toContain('src="http://localhost:3011/api/media/file/foto.webp"');
    expect(html).toContain("&quot;Camp&quot;");
    expect(html).toContain("<figcaption");
  });

  it("omits the caption when the upload has no alt text", () => {
    const html = lexicalToHtml(
      editorState([
        {
          type: "upload",
          relationTo: "media",
          value: { id: 7, url: "https://cdn.example.org/foto.webp", alt: null, width: null, height: null },
          fields: null,
          format: "",
          version: 3,
        },
      ]),
      undefined,
    );
    expect(html).toContain('src="https://cdn.example.org/foto.webp"');
    expect(html).not.toContain("<figcaption");
  });

  it("skips unpopulated or url-less uploads", () => {
    const html = lexicalToHtml(
      editorState([
        { type: "upload", relationTo: "media", value: 7, fields: null, format: "", version: 3 },
        {
          type: "upload",
          relationTo: "media",
          value: { id: 8, url: null, alt: null, width: null, height: null },
          fields: null,
          format: "",
          version: 3,
        },
      ]),
      undefined,
    );
    expect(html).not.toContain("<img");
  });
});
