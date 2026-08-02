import { describe, expect, it } from "vitest";

import { lexicalToPlainText } from "./lexical-text";

function doc(children: unknown[]): { root: Record<string, unknown> } {
  return { root: { type: "root", children } };
}

function paragraph(...children: unknown[]): Record<string, unknown> {
  return { type: "paragraph", children };
}

function text(value: string): Record<string, unknown> {
  return { type: "text", text: value };
}

describe("lexicalToPlainText", () => {
  it("returns an empty string for missing content", () => {
    expect(lexicalToPlainText(null)).toBe("");
    expect(lexicalToPlainText(undefined)).toBe("");
  });

  it("joins inline text nodes without inserting separators", () => {
    // Bold/italic runs split one sentence across nodes — no space belongs
    // between them beyond what the text itself carries.
    const content = doc([paragraph(text("Die Dragons "), text("gewinnen"), text(" das Derby."))]);
    expect(lexicalToPlainText(content)).toBe("Die Dragons gewinnen das Derby.");
  });

  it("separates block-level nodes with a space", () => {
    const content = doc([
      { type: "heading", children: [text("Saisonstart")] },
      paragraph(text("Es geht wieder los.")),
    ]);
    expect(lexicalToPlainText(content)).toBe("Saisonstart Es geht wieder los.");
  });

  it("treats explicit line breaks as spaces", () => {
    const content = doc([paragraph(text("Zeile eins"), { type: "linebreak" }, text("Zeile zwei"))]);
    expect(lexicalToPlainText(content)).toBe("Zeile eins Zeile zwei");
  });

  it("descends into nested lists", () => {
    const content = doc([
      {
        type: "list",
        children: [
          { type: "listitem", children: [text("Damen")] },
          { type: "listitem", children: [text("Herren")] },
        ],
      },
    ]);
    expect(lexicalToPlainText(content)).toBe("Damen Herren");
  });

  it("skips nodes without text, like upload blocks", () => {
    const content = doc([
      { type: "upload", value: { url: "/media/foo.webp" } },
      paragraph(text("Bildunterschrift folgt im Text.")),
    ]);
    expect(lexicalToPlainText(content)).toBe("Bildunterschrift folgt im Text.");
  });

  it("collapses runs of whitespace left by empty paragraphs", () => {
    const content = doc([paragraph(text("Eins")), paragraph(), paragraph(text("Zwei"))]);
    expect(lexicalToPlainText(content)).toBe("Eins Zwei");
  });

  it("ignores non-object children defensively", () => {
    const content = doc([paragraph(text("Sicher"), null, 42, "roher string")]);
    expect(lexicalToPlainText(content)).toBe("Sicher");
  });
});
