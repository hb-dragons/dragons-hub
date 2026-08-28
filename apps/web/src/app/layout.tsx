import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@wrksz/themes/next";
import { getLocale } from "next-intl/server";
import "@dragons/ui/globals.css";
import "@daveyplate/better-auth-ui/css";
import "./social-fonts.css";

// One family for sans and display, matching the public site (apps/site):
// globals.css aliases --font-display to --font-sans on body.
const bricolage = Bricolage_Grotesque({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The `[locale]` segment is a child of this root layout, so its params
  // aren't available here — but `getLocale()` reads the locale next-intl's
  // proxy (middleware) already resolved for this request, regardless of
  // where in the tree it's called. Without this, `<html>` never carries a
  // `lang` attribute (WCAG 3.1.1): screen readers guess the language and
  // browser auto-translate misfires on a bilingual site.
  const locale = await getLocale();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body
        className={`${bricolage.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
