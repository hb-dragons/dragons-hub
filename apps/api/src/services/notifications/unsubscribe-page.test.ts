import { describe, expect, it } from "vitest";
import { renderUnsubscribePage, type UnsubscribePageKind } from "./unsubscribe-page";

const KINDS: UnsubscribePageKind[] = ["confirm", "done", "already", "invalid"];

describe("renderUnsubscribePage", () => {
  it.each(KINDS)("renders %s as a complete standalone document", (kind) => {
    const html = renderUnsubscribePage(kind, "de", "https://api.dragons.de/u?token=t");

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<meta charset="utf-8" />');
    expect(html).toContain("<title>");
    expect(html).toContain("</html>");
    // No external asset can be fetched from a page reached out of an inbox.
    expect(html).not.toMatch(/<(script|link)\b/);
  });

  it.each(KINDS)("keeps %s out of search indexes", (kind) => {
    expect(renderUnsubscribePage(kind, "de")).toContain(
      '<meta name="robots" content="noindex, nofollow" />',
    );
  });

  it.each(["de", "en"] as const)("marks the document language as %s", (locale) => {
    expect(renderUnsubscribePage("confirm", locale)).toContain(`<html lang="${locale}">`);
  });

  describe("confirm", () => {
    it("offers a POST form to the given action", () => {
      const html = renderUnsubscribePage(
        "confirm",
        "en",
        "https://api.dragons.de/public/notifications/unsubscribe?token=t",
      );

      expect(html).toContain('<form method="post"');
      expect(html).toContain(
        'action="https://api.dragons.de/public/notifications/unsubscribe?token=t"',
      );
      expect(html).toContain("Unsubscribe</button>");
    });

    // The button is the state change; a page that needed JavaScript would fail
    // silently in the mail clients and locked-down browsers members read on.
    it("needs no JavaScript to submit", () => {
      const html = renderUnsubscribePage("confirm", "de", "https://x.test/u");

      expect(html).not.toContain("javascript:");
      // No inline handler attribute (` onclick=`, ` onsubmit=`, …).
      expect(html).not.toMatch(/\son[a-z]+=/);
    });

    it("says the opt-out covers email only", () => {
      expect(renderUnsubscribePage("confirm", "en", "https://x.test/u")).toContain(
        "This affects email only",
      );
      expect(renderUnsubscribePage("confirm", "de", "https://x.test/u")).toContain(
        "Betrifft nur E-Mail",
      );
    });

    it("renders no form when it has no action to post to", () => {
      expect(renderUnsubscribePage("confirm", "de")).not.toContain("<form");
    });

    it("escapes an action URL rather than letting it close the attribute", () => {
      const html = renderUnsubscribePage(
        "confirm",
        "de",
        'https://x.test/u?token="><script>alert(1)</script>',
      );

      expect(html).not.toContain("<script>");
      expect(html).toContain("&quot;&gt;&lt;script&gt;");
    });
  });

  describe("done and already", () => {
    it.each(["done", "already"] as const)("%s offers no further action", (kind) => {
      expect(renderUnsubscribePage(kind, "de", "https://x.test/u")).not.toContain(
        "<form",
      );
    });

    it("tells a member how to get email back", () => {
      expect(renderUnsubscribePage("done", "en")).toContain("contact the club");
      expect(renderUnsubscribePage("done", "de")).toContain("melde dich beim Verein");
    });

    it("does not claim a fresh opt-out when one was already on file", () => {
      expect(renderUnsubscribePage("already", "en")).toContain("Already unsubscribed");
    });
  });

  describe("invalid", () => {
    // Loud, not reassuring: a member who thinks they unsubscribed and keeps
    // getting mail is the failure this whole path exists to prevent.
    it("says nothing was changed and names a way out", () => {
      const en = renderUnsubscribePage("invalid", "en");

      expect(en).toContain("not valid");
      expect(en).toContain("Nothing was changed");
      expect(en).toContain("contact the club");
    });

    it("says the same in German", () => {
      const de = renderUnsubscribePage("invalid", "de");

      expect(de).toContain("nicht gültig");
      expect(de).toContain("Es wurde nichts geändert");
    });

    it("reflects no token back into the page", () => {
      expect(renderUnsubscribePage("invalid", "de", "https://x.test/u?token=secret"))
        .not.toContain("secret");
    });
  });
});
