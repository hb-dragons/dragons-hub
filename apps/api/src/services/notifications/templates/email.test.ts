import { describe, expect, it } from "vitest";
import { renderEmailMessage } from "./email";

const message = {
  title: "🏀 Spielverlegung: Dragons vs Tigers",
  body: "Dragons vs Tigers (Oberliga) wurde verlegt.\nNeu: 12.03. (vorher: 05.03.)",
};

describe("renderEmailMessage", () => {
  it("uses the rendered title as the subject", () => {
    expect(renderEmailMessage(message, "de").subject).toBe(message.title);
  });

  it("always produces both a text and an html part", () => {
    const rendered = renderEmailMessage(message, "de");
    expect(rendered.text).not.toBe("");
    expect(rendered.html).not.toBe("");
  });

  it("keeps the plain-text body verbatim at the head of the text part", () => {
    expect(renderEmailMessage(message, "de").text.startsWith(message.body)).toBe(true);
  });

  it("carries every word of the body into the html part", () => {
    const { html } = renderEmailMessage(message, "de");
    expect(html).toContain("Dragons vs Tigers (Oberliga) wurde verlegt.");
    expect(html).toContain("Neu: 12.03. (vorher: 05.03.)");
  });

  it("renders a single newline inside a block as <br />", () => {
    const { html } = renderEmailMessage(message, "de");
    expect(html).toContain("wurde verlegt.<br />Neu:");
  });

  it("splits blank-line-separated blocks into separate paragraphs", () => {
    const { html } = renderEmailMessage(
      { title: "T", body: "First block.\n\nSecond block." },
      "en",
    );
    expect(html).toContain(`<p style="margin:0 0 12px;">First block.</p>`);
    expect(html).toContain(`<p style="margin:0 0 12px;">Second block.</p>`);
  });

  // Event bodies interpolate federation-supplied names; an unescaped `<` there
  // would let a team name close the surrounding tag.
  it("escapes html metacharacters in the title and body", () => {
    const { html } = renderEmailMessage(
      { title: `<b>T & "T"</b>`, body: `<script>alert('x')</script>` },
      "de",
    );
    expect(html).toContain("&lt;b&gt;T &amp; &quot;T&quot;&lt;/b&gt;");
    expect(html).toContain("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });

  describe("footer", () => {
    it("is German for a German locale", () => {
      const rendered = renderEmailMessage(message, "de");
      expect(rendered.text).toContain("automatisch von Dragons Hub gesendet");
      expect(rendered.html).toContain("automatisch von Dragons Hub gesendet");
    });

    it("is English for an English locale", () => {
      const rendered = renderEmailMessage(message, "en-GB");
      expect(rendered.text).toContain("sent automatically by Dragons Hub");
      expect(rendered.html).toContain("sent automatically by Dragons Hub");
    });

    it("falls back to German for an unknown locale", () => {
      expect(renderEmailMessage(message, "fr").text).toContain(
        "automatisch von Dragons Hub gesendet",
      );
    });
  });

  describe("call to action", () => {
    // The link goes into both parts: a text-only reader must not be told about
    // a button that exists only in the HTML.
    it("appears in both parts when a link is given", () => {
      const rendered = renderEmailMessage(message, "de", "https://hub.test/matches/7");
      expect(rendered.text).toContain("In Dragons Hub öffnen: https://hub.test/matches/7");
      expect(rendered.html).toContain(
        `<a href="https://hub.test/matches/7">In Dragons Hub öffnen</a>`,
      );
    });

    it("is localised", () => {
      const rendered = renderEmailMessage(message, "en", "https://hub.test/matches/7");
      expect(rendered.text).toContain("Open in Dragons Hub: https://hub.test/matches/7");
      expect(rendered.html).toContain("Open in Dragons Hub");
    });

    it("is absent from both parts when no link is given", () => {
      const rendered = renderEmailMessage(message, "de");
      expect(rendered.text).not.toContain("In Dragons Hub öffnen");
      expect(rendered.html).not.toContain("<a href");
    });

    it("escapes the href", () => {
      const { html } = renderEmailMessage(message, "de", `https://hub.test/a"b`);
      expect(html).toContain(`href="https://hub.test/a&quot;b"`);
    });
  });

  describe("unsubscribe link (issue #134)", () => {
    const unsubscribe = "https://api.test/public/notifications/unsubscribe?token=t";

    // The List-Unsubscribe header is honoured by mail clients, not by people.
    // A member reading the message needs a link they can see and click.
    it("appears in both parts when a URL is given", () => {
      const rendered = renderEmailMessage(message, "de", undefined, unsubscribe);

      expect(rendered.text).toContain(
        `Keine E-Mail-Benachrichtigungen mehr erhalten: ${unsubscribe}`,
      );
      expect(rendered.html).toContain(`href="${unsubscribe}"`);
      expect(rendered.html).toContain("Keine E-Mail-Benachrichtigungen mehr erhalten");
    });

    it("is localised", () => {
      const rendered = renderEmailMessage(message, "en", undefined, unsubscribe);

      expect(rendered.text).toContain(
        `Stop receiving email notifications: ${unsubscribe}`,
      );
      expect(rendered.html).toContain("Stop receiving email notifications");
    });

    it("sits alongside the call to action rather than replacing it", () => {
      const rendered = renderEmailMessage(
        message,
        "en",
        "https://hub.test/matches/7",
        unsubscribe,
      );

      expect(rendered.text).toContain("Open in Dragons Hub: https://hub.test/matches/7");
      expect(rendered.text).toContain(`Stop receiving email notifications: ${unsubscribe}`);
      expect(rendered.html).toContain(`href="https://hub.test/matches/7"`);
      expect(rendered.html).toContain(`href="${unsubscribe}"`);
    });

    it("keeps the body verbatim at the head of the text part", () => {
      const rendered = renderEmailMessage(message, "de", undefined, unsubscribe);

      expect(rendered.text.startsWith(message.body)).toBe(true);
    });

    it("is absent from both parts when no URL is given", () => {
      const rendered = renderEmailMessage(message, "de");

      expect(rendered.text).not.toContain("Keine E-Mail-Benachrichtigungen");
      expect(rendered.html).not.toContain("Keine E-Mail-Benachrichtigungen");
    });

    it("escapes the href", () => {
      const { html } = renderEmailMessage(
        message,
        "de",
        undefined,
        `https://api.test/u?t="><script>alert(1)</script>`,
      );

      expect(html).toContain("&quot;&gt;&lt;script&gt;");
      expect(html).not.toContain("<script>");
    });
  });
});
