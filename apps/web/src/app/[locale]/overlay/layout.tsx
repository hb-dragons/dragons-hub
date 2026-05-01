// OBS browser-source loads this URL. Body must be transparent so the
// scoreboard composites cleanly over the gameplay capture. No navbar,
// no global chrome, no padding from /[locale]/(public) layouts.
export default function OverlayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen w-screen flex bg-transparent">
      {children}
    </div>
  );
}
