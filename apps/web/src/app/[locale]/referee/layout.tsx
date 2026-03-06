import { Link } from "@/lib/navigation";

export default function RefereeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link href="/referee/matches" className="font-semibold">
              SR-Bereich
            </Link>
          </div>
        </div>
      </header>
      <main className="container px-4 py-6">{children}</main>
    </div>
  );
}
