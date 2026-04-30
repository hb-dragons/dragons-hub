// Standalone layout: full-screen dark surface, no navbar, no bottom tabs.
// The live scoreboard renders for projectors and phones in landscape — the
// public site chrome would only get in the way.
export default function LiveLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-black to-zinc-950 text-white">
      {children}
    </div>
  );
}
