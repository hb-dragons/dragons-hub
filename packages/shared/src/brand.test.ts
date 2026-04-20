import { afterEach, describe, expect, it, vi } from "vitest";
import { clubLogoUrl } from "./brand";

describe("clubLogoUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns dev default URL when no env or arg is set", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("EXPO_PUBLIC_API_URL", "");
    expect(clubLogoUrl(42)).toBe("http://localhost:3001/public/assets/clubs/42.webp");
  });

  it("uses explicit baseUrl argument over env", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://env.example.com");
    expect(clubLogoUrl(7, "https://arg.example.com")).toBe(
      "https://arg.example.com/public/assets/clubs/7.webp",
    );
  });

  it("uses NEXT_PUBLIC_API_URL when set", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://web.example.com");
    vi.stubEnv("EXPO_PUBLIC_API_URL", "");
    expect(clubLogoUrl(1)).toBe("https://web.example.com/public/assets/clubs/1.webp");
  });

  it("uses EXPO_PUBLIC_API_URL when NEXT_PUBLIC_API_URL is absent", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("EXPO_PUBLIC_API_URL", "https://expo.example.com");
    expect(clubLogoUrl(9)).toBe("https://expo.example.com/public/assets/clubs/9.webp");
  });

  it("prefers NEXT_PUBLIC_API_URL over EXPO_PUBLIC_API_URL when both are set", () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://web.example.com");
    vi.stubEnv("EXPO_PUBLIC_API_URL", "https://expo.example.com");
    expect(clubLogoUrl(3)).toBe("https://web.example.com/public/assets/clubs/3.webp");
  });
});
