import { describe, it, expect, vi } from "vitest";

const getLocaleMock = vi.fn();
vi.mock("next-intl/server", () => ({
  getLocale: () => getLocaleMock(),
}));

vi.mock("next/font/google", () => ({
  Bricolage_Grotesque: () => ({ variable: "--font-sans" }),
  JetBrains_Mono: () => ({ variable: "--font-mono" }),
}));

vi.mock("@wrksz/themes/next", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@dragons/ui/globals.css", () => ({}));
vi.mock("@daveyplate/better-auth-ui/css", () => ({}));
vi.mock("./social-fonts.css", () => ({}));

import RootLayout from "./layout";

describe("<RootLayout>", () => {
  it("sets <html lang> to the active locale (WCAG 3.1.1)", async () => {
    getLocaleMock.mockResolvedValue("de");
    const element = await RootLayout({ children: <div /> });
    expect(element.props.lang).toBe("de");
  });

  it("reflects a different active locale", async () => {
    getLocaleMock.mockResolvedValue("en");
    const element = await RootLayout({ children: <div /> });
    expect(element.props.lang).toBe("en");
  });
});
