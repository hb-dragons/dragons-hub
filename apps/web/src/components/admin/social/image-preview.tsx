"use client";

import { Rnd } from "react-rnd";
import { WeekendPreview, WeekendResults } from "@dragons/shared/social-templates";
import type { MatchRow } from "@dragons/shared/social-templates";
import type { WizardState } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const DISPLAY_SIZE = 540;
const SCALE_FACTOR = 2; // maps display coords to 1080-space

interface ImagePreviewProps {
  state: WizardState;
  onUpdate: (updates: Partial<WizardState>) => void;
}

/** Map frontend MatchItem to the shared MatchRow type used by templates */
function toMatchRows(state: WizardState): MatchRow[] {
  return state.matches.map((m) => ({
    teamLabel: m.teamLabel,
    opponent: m.opponent,
    isHome: m.isHome,
    kickoffTime: m.kickoffTime,
    homeScore: m.homeScore ?? undefined,
    guestScore: m.guestScore ?? undefined,
  }));
}

export function ImagePreview({ state, onUpdate }: ImagePreviewProps) {
  const photo = state.selectedPhoto;

  // Derive display-space dimensions for the player photo
  const photoDisplayWidth = photo
    ? Math.round((photo.width * state.playerPosition.scale) / SCALE_FACTOR)
    : 0;
  const photoDisplayHeight = photo
    ? Math.round((photo.height * state.playerPosition.scale) / SCALE_FACTOR)
    : 0;

  const matchRows = toMatchRows(state);
  const footer = "@dragons_hannover";

  return (
    <div
      style={{ width: DISPLAY_SIZE, height: DISPLAY_SIZE, position: "relative", overflow: "visible" }}
      className="rounded-md border border-border select-none"
    >
      {/* Layer 1: Background image */}
      {state.selectedBackgroundId !== null && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${API_BASE}/admin/social/backgrounds/${state.selectedBackgroundId}/image`}
          alt="Hintergrund"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          crossOrigin="use-credentials"
        />
      )}

      {/* Layer 2: Text overlay — same template as server-side export, scaled to fit preview */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${1 / SCALE_FACTOR})`,
          transformOrigin: "top left",
          width: 1080,
          height: 1080,
          pointerEvents: "none",
        }}
      >
        {state.postType === "preview"
          ? <WeekendPreview calendarWeek={state.calendarWeek} matches={matchRows} footer={footer} />
          : <WeekendResults calendarWeek={state.calendarWeek} matches={matchRows} footer={footer} />
        }
      </div>

      {/* Layer 3: Player photo (draggable/resizable) */}
      {state.selectedPhotoId !== null && photo !== null && (
        <Rnd
          lockAspectRatio
          position={{
            x: state.playerPosition.x / SCALE_FACTOR,
            y: state.playerPosition.y / SCALE_FACTOR,
          }}
          size={{ width: photoDisplayWidth, height: photoDisplayHeight }}
          onDragStop={(_e, d) => {
            onUpdate({
              playerPosition: {
                ...state.playerPosition,
                x: Math.round(d.x * SCALE_FACTOR),
                y: Math.round(d.y * SCALE_FACTOR),
              },
            });
          }}
          onResizeStop={(_e, _dir, ref, _delta, position) => {
            const newDisplayWidth = ref.offsetWidth;
            const newScale = (newDisplayWidth * SCALE_FACTOR) / photo.width;
            onUpdate({
              playerPosition: {
                x: Math.round(position.x * SCALE_FACTOR),
                y: Math.round(position.y * SCALE_FACTOR),
                scale: newScale,
              },
            });
          }}
          style={{ cursor: "move", zIndex: 10 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${API_BASE}/admin/social/player-photos/${state.selectedPhotoId}/image`}
            alt="Spielerfoto"
            style={{ width: "100%", height: "100%", objectFit: "fill", display: "block" }}
            crossOrigin="use-credentials"
            draggable={false}
          />
        </Rnd>
      )}
    </div>
  );
}
