import { Archivo } from "next/font/google";
import { Toaster } from "sonner";
import "@dragons/ui/globals.css";
import "@daveyplate/better-auth-ui/css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  display: "swap",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body
        className={`${archivo.variable} font-sans antialiased tracking-wide`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
