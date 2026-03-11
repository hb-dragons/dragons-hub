"use client";

import { Rnd } from "react-rnd";
import type { WizardState } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const DISPLAY_SIZE = 540;
const SCALE_FACTOR = 2; // maps display coords to 1080-space

interface ImagePreviewProps {
  state: WizardState;
  onUpdate: (updates: Partial<WizardState>) => void;
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

  const title = state.postType === "preview" ? "SPIELTAG" : "ERGEBNISSE";

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

      {/* Layer 2: Text overlay (CSS approximation of the Satori template) */}
      <div
        style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", padding: "20px 18px 14px" }}
        className="text-white"
      >
        {/* Header */}
        <div className="mb-1">
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: "0.08em", lineHeight: 1 }}>
            {title}
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", opacity: 0.8 }}>
            KALENDERWOCHE {state.calendarWeek}
          </div>
        </div>

        {/* Match rows */}
        <div className="mt-2 flex-1 space-y-1 overflow-hidden">
          {state.matches.map((match) => {
            const isAway = !match.isHome;
            const hasScore =
              match.homeScore !== null && match.guestScore !== null;
            const scoreOrTime = hasScore
              ? `${match.homeScore ?? ""}:${match.guestScore ?? ""}`
              : match.kickoffTime ?? "";

            return (
              <div
                key={match.id}
                style={{
                  fontSize: 9,
                  padding: "3px 5px",
                  borderRadius: 2,
                  backgroundColor: isAway ? "rgba(249,115,22,0.15)" : "rgba(255,255,255,0.08)",
                  borderLeft: isAway ? "2px solid rgb(249,115,22)" : "2px solid transparent",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span style={{ fontWeight: 700, flexShrink: 0 }}>{match.teamLabel}</span>
                <span style={{ fontWeight: 900, flexShrink: 0 }}>{scoreOrTime}</span>
                <span style={{ opacity: 0.8, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  vs {match.opponent}
                </span>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{ fontSize: 7, opacity: 0.7, marginTop: 4, display: "flex", gap: 10 }}>
          <span>● Heimspiel</span>
          <span style={{ color: "rgb(249,115,22)" }}>● Auswärtsspiel</span>
        </div>

        {/* Footer */}
        <div style={{ fontSize: 7, opacity: 0.6, marginTop: 2 }}>
          Dragons Basketball · Halle Musterstraße 1
        </div>

        {/* Approximation note */}
        <div style={{ fontSize: 6, opacity: 0.45, marginTop: 1, fontStyle: "italic" }}>
          Generiertes Bild kann leicht abweichen
        </div>
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
