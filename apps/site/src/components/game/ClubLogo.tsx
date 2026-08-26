import { useState } from "react";

import { API_BASE } from "../../lib/api";

/**
 * Club crest on a game card. Shared by the Spielplan/team cards and the
 * homepage card so both degrade the same way (#264): the API answers a missing
 * club asset with a JSON 404, which Chrome's Opaque Response Blocking rejects
 * as an image, so an `onError` fallback is the only thing between the reader
 * and a broken-image glyph.
 */
export function ClubLogo({
  clubId,
  isOwnClub,
  alt,
  className = "",
  fallbackClassName = "",
}: {
  clubId: number | null | undefined;
  isOwnClub: boolean;
  alt: string;
  className?: string;
  fallbackClassName?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span role="img" aria-label={alt} className={fallbackClassName}>
        🏀
      </span>
    );
  }

  return (
    <img
      src={isOwnClub ? "/img/logo.svg" : `${API_BASE}/public/assets/clubs/${clubId}.webp`}
      className={className}
      alt={alt}
      onError={() => setFailed(true)}
    />
  );
}
