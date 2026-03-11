import type { ReactNode } from "react";

export interface MatchRow {
  teamLabel: string;
  opponent: string;
  isHome: boolean;
  kickoffTime?: string;
  homeScore?: number;
  guestScore?: number;
}

interface PostLayoutProps {
  title: string;
  subtitle: string;
  matches: MatchRow[];
  footer: string;
  renderMatchDetail: (match: MatchRow) => ReactNode;
}

export function PostLayout({ title, subtitle, matches, footer, renderMatchDetail }: PostLayoutProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", width: 1080, height: 1080, fontFamily: "League Spartan", color: "white", padding: "40px 50px" }}>
      {/* Title */}
      <div style={{ display: "flex", flexDirection: "column", marginBottom: 20 }}>
        <div style={{ fontSize: 80, fontWeight: 900, fontFamily: "Greater Theory", textTransform: "uppercase", letterSpacing: 2 }}>
          {title}
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, opacity: 0.9 }}>{subtitle}</div>
      </div>

      {/* Match rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
        {matches.map((match, i) => (
          <div key={i} style={{
            display: "flex",
            flexDirection: "column",
            padding: "12px 16px",
            backgroundColor: match.isHome ? "transparent" : "rgba(249, 115, 22, 0.15)",
            borderLeft: match.isHome ? "none" : "4px solid rgba(249, 115, 22, 0.8)",
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <div style={{ fontSize: 36, fontWeight: 800 }}>{match.teamLabel}</div>
              {renderMatchDetail(match)}
            </div>
            <div style={{ fontSize: 24, opacity: 0.85 }}>vs {match.opponent}</div>
          </div>
        ))}
      </div>

      {/* Home/Away legend */}
      <div style={{ display: "flex", justifyContent: "center", gap: 24, marginBottom: 12 }}>
        <div style={{ fontSize: 20, fontWeight: 600, padding: "6px 20px" }}>HEIM</div>
        <div style={{ fontSize: 20, fontWeight: 600, padding: "6px 20px", backgroundColor: "rgba(249, 115, 22, 0.8)" }}>AUSW.</div>
      </div>

      {/* Footer */}
      <div style={{ display: "flex", fontSize: 14, justifyContent: "center", opacity: 0.7, textTransform: "uppercase", letterSpacing: 1 }}>
        {footer}
      </div>
    </div>
  );
}
