import { describe, expect, it } from "vitest";
import {
  LEGAL_LINKS,
  PRIVACY_MAILBOX,
  SUPPORT_MAILBOX,
  appVersionLabel,
  buildMailto,
  buildSupportMailto,
} from "@/lib/legal/links";

describe("LEGAL_LINKS", () => {
  it("point at the club site over https", () => {
    expect(LEGAL_LINKS.privacy).toBe("https://hbdragons.de/datenschutz");
    expect(LEGAL_LINKS.imprint).toBe("https://hbdragons.de/impressum");
  });

  it("names role mailboxes, never a person", () => {
    expect(SUPPORT_MAILBOX).toBe("app@hbdragons.de");
    expect(PRIVACY_MAILBOX).toBe("datenschutz@hbdragons.de");
  });
});

describe("appVersionLabel", () => {
  it("joins version and build", () => {
    expect(appVersionLabel({ version: "1.0.0", build: "5" })).toBe("1.0.0 (5)");
  });

  it("drops the build when the platform does not report one", () => {
    expect(appVersionLabel({ version: "1.0.0", build: null })).toBe("1.0.0");
  });

  it("says dev when nothing native is available (tests, Expo Go)", () => {
    expect(appVersionLabel({ version: null, build: null })).toBe("dev");
  });
});

describe("buildMailto", () => {
  it("percent-encodes the subject and body", () => {
    const url = buildMailto({ to: "a@b.de", subject: "Grüße & Fragen", body: "Zeile 1\nZeile 2" });
    expect(url).toBe("mailto:a@b.de?subject=Gr%C3%BC%C3%9Fe%20%26%20Fragen&body=Zeile%201%0AZeile%202");
  });

  it("omits the body parameter when there is no body", () => {
    expect(buildMailto({ to: "a@b.de", subject: "Hi" })).toBe("mailto:a@b.de?subject=Hi");
  });
});

describe("buildSupportMailto", () => {
  it("addresses the support mailbox with the version and platform in the subject", () => {
    const url = buildSupportMailto({ version: "1.0.0", build: "5", platform: "ios" });
    expect(url.startsWith(`mailto:${SUPPORT_MAILBOX}?subject=`)).toBe(true);
    expect(decodeURIComponent(url.split("subject=")[1]!)).toBe("Dragons App 1.0.0 (5) ios — Support");
  });
});
