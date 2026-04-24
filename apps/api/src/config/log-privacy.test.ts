import { describe, expect, it } from "vitest";
import { anonymizeIp, scrubUrl } from "./log-privacy";

describe("anonymizeIp", () => {
  it("returns undefined for undefined", () => {
    expect(anonymizeIp(undefined)).toBeUndefined();
  });

  it("returns undefined for empty / whitespace", () => {
    expect(anonymizeIp("")).toBeUndefined();
    expect(anonymizeIp("   ")).toBeUndefined();
  });

  it("zeroes the last octet of an IPv4 address", () => {
    expect(anonymizeIp("203.0.113.5")).toBe("203.0.113.0");
    expect(anonymizeIp("192.168.1.127")).toBe("192.168.1.0");
    expect(anonymizeIp("10.0.0.1")).toBe("10.0.0.0");
  });

  it("trims surrounding whitespace", () => {
    expect(anonymizeIp("  203.0.113.5  ")).toBe("203.0.113.0");
  });

  it("rejects IPv4 with out-of-range octets", () => {
    expect(anonymizeIp("999.0.0.1")).toBeUndefined();
    expect(anonymizeIp("256.256.256.256")).toBeUndefined();
  });

  it("zeroes the last 4 groups of a full IPv6 address", () => {
    expect(
      anonymizeIp("2001:0db8:85a3:0000:0000:8a2e:0370:7334"),
    ).toBe("2001:0db8:85a3:0000::");
  });

  it("expands a compressed IPv6 address before truncating", () => {
    expect(anonymizeIp("2001:db8::1")).toBe("2001:db8:0:0::");
    expect(anonymizeIp("fe80::1")).toBe("fe80:0:0:0::");
  });

  it("handles the IPv6 unspecified address", () => {
    expect(anonymizeIp("::")).toBe("0:0:0:0::");
  });

  it("strips IPv6 zone identifiers before anonymizing", () => {
    expect(anonymizeIp("fe80::1%en0")).toBe("fe80:0:0:0::");
  });

  it("anonymizes IPv4-mapped IPv6 as IPv4", () => {
    expect(anonymizeIp("::ffff:203.0.113.5")).toBe("203.0.113.0");
    expect(anonymizeIp("::FFFF:10.0.0.1")).toBe("10.0.0.0");
  });

  it("rejects IPv6 with more than one '::'", () => {
    expect(anonymizeIp("1::2::3")).toBeUndefined();
  });

  it("rejects IPv6 without compression if fewer than 8 groups", () => {
    expect(anonymizeIp("1:2:3:4:5:6:7")).toBeUndefined();
  });

  it("rejects IPv6 with non-hex groups", () => {
    expect(anonymizeIp("2001:db8::zzzz")).toBeUndefined();
    expect(anonymizeIp("gggg:db8::1")).toBeUndefined();
  });

  it("rejects IPv6 with group count > 8 when expanded", () => {
    expect(anonymizeIp("1:2:3:4:5:6:7:8:9")).toBeUndefined();
  });

  it("returns undefined for garbage input", () => {
    expect(anonymizeIp("not-an-ip")).toBeUndefined();
  });
});

describe("scrubUrl", () => {
  it("leaves path-only URLs untouched", () => {
    expect(scrubUrl("/users/42")).toBe("/users/42");
  });

  it("redacts query values but keeps keys", () => {
    expect(scrubUrl("/reset?email=alice@example.com&token=xyz")).toBe(
      "/reset?email=%5BREDACTED%5D&token=%5BREDACTED%5D",
    );
  });

  it("preserves repeated query keys", () => {
    expect(scrubUrl("/a?tag=one&tag=two")).toBe(
      "/a?tag=%5BREDACTED%5D&tag=%5BREDACTED%5D",
    );
  });

  it("handles empty query after '?'", () => {
    expect(scrubUrl("/a?")).toBe("/a");
  });

  it("redacts query values on a full URL and preserves origin + path", () => {
    expect(
      scrubUrl("https://api.example.com/v1/things?secret=abc"),
    ).toBe("https://api.example.com/v1/things?secret=%5BREDACTED%5D");
  });

  it("strips an empty query string from a full URL", () => {
    expect(scrubUrl("https://api.example.com/v1/things")).toBe(
      "https://api.example.com/v1/things",
    );
  });

  it("leaves unparseable, quoteless input alone when there is no '?'", () => {
    expect(scrubUrl("not a url")).toBe("not a url");
  });

  it("scrubs path?query even when the leading part isn't a valid URL", () => {
    expect(scrubUrl("weird path?secret=abc")).toBe(
      "weird path?secret=%5BREDACTED%5D",
    );
  });
});
