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
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-[96rem] flex-1 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
