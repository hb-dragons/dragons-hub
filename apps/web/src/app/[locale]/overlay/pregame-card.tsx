"use client";

import type { BroadcastMatch } from "@dragons/shared";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function logoUrl(clubId: number): string {
  return `${apiBase}/assets/clubs/${clubId}.webp`;
}

export function PregameCard({ match }: { match: BroadcastMatch }) {
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2"
      style={{ bottom: "8vh", width: "min(720px, 80vw)" }}
    >
      <div
        className="flex items-center gap-6 rounded-xl px-8 py-6 backdrop-blur"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.7), rgba(0,0,0,0.85))",
          borderTop: `6px solid ${match.home.color}`,
          borderBottom: `6px solid ${match.guest.color}`,
        }}
      >
        <TeamSide team={match.home} side="left" />
        <div className="flex flex-1 flex-col items-center gap-2">
          <div className="text-sm uppercase tracking-widest text-white/70">
            {match.league?.name ?? ""}
          </div>
          <div
            className="font-black tabular-nums"
            style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}
          >
            {match.kickoffTime.slice(0, 5)}
          </div>
          <div className="text-sm text-white/60">{match.kickoffDate}</div>
        </div>
        <TeamSide team={match.guest} side="right" />
      </div>
    </div>
  );
}

function TeamSide({
  team,
  side,
}: {
  team: BroadcastMatch["home"];
  side: "left" | "right";
}) {
  const align = side === "left" ? "items-start" : "items-end";
  return (
    <div className={`flex flex-col gap-3 ${align}`}>
      <img
        src={logoUrl(team.clubId)}
        alt={team.name}
        style={{ width: "96px", height: "96px", objectFit: "contain" }}
      />
      <div
        className="font-black uppercase"
        style={{ fontSize: "clamp(1rem, 1.6vw, 1.5rem)" }}
      >
        {team.name}
      </div>
    </div>
  );
}
