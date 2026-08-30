import { PublicHeader } from "@/components/public/public-header";

// The coach spielplan table needs the full viewport width, so it lives
// outside the phone-first `(public)` shell (max-w-2xl) — same pattern as
// `/live` and `/overlay`. Keep it listed in `PUBLIC_PATH_PREFIXES`
// (src/proxy.ts): it is public, coaches have no accounts.
export default function SpielplanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // h-dvh + min-h-0 chain: the page itself never scrolls — the table body
    // scrolls inside its own container under a sticky header (legacy UX,
    // matters most on phones).
    <div className="flex h-dvh flex-col">
      <PublicHeader />
      <main className="mx-auto flex min-h-0 w-full max-w-[96rem] flex-1 flex-col px-2 py-2 md:px-4 md:py-6">
        {children}
      </main>
    </div>
  );
}
