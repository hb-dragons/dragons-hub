// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import deMessages from "@/messages/de.json";

vi.mock("@wrksz/themes/client", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}));

import { ThemeToggle } from "./theme-toggle";

function wrap(ui: React.ReactNode, locale: "en" | "de" = "en") {
  const messages = locale === "en" ? enMessages : deMessages;
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>
  );
}

describe("<ThemeToggle> i18n — renders on every public page", () => {
  afterEach(cleanup);

  it("labels the control in English", () => {
    render(wrap(<ThemeToggle />));
    expect(screen.getByText(enMessages.common.toggleTheme)).toBeInTheDocument();
  });

  it("labels the control in German, not the hardcoded English string", () => {
    render(wrap(<ThemeToggle />, "de"));
    expect(screen.queryByText("Toggle theme")).not.toBeInTheDocument();
    expect(screen.getByText(deMessages.common.toggleTheme)).toBeInTheDocument();
  });
});
