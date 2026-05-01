// Standalone layout for projectors and phones in landscape — public site
// chrome would only get in the way. Forces dark mode so design tokens resolve
// to deep surfaces regardless of the viewer's theme preference.
export default function LiveLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="dark min-h-screen bg-background text-foreground">
      {children}
    </div>
  );
}
