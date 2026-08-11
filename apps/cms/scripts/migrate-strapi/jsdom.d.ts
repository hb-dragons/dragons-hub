// jsdom 26.1.0 ships no bundled types, and @types/jsdom would be a second
// dependency this task is not scoped to add. This declares only the shape
// convertHTMLToLexical actually needs (a JSDOM constructor exposing
// window.document), not the full jsdom API surface. If @types/jsdom ever
// lands here, delete this.
declare module "jsdom" {
  export class JSDOM {
    constructor(html: string);
    window: { document: Document };
  }
}
