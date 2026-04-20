import { clubLogoUrl } from "@dragons/shared";
import { cn } from "@dragons/ui/lib/utils";

type ClubLogoProps = {
  clubId?: number | null;
  size?: number;
  alt?: string;
  className?: string;
};

export function ClubLogo({ clubId, size = 24, alt = "", className }: ClubLogoProps) {
  if (!clubId) {
    return (
      <div
        className={cn("rounded-md bg-muted", className)}
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote club crest served from our own API; next/image optimizer bypassed
    <img
      src={clubLogoUrl(clubId)}
      width={size}
      height={size}
      alt={alt}
      loading="lazy"
      className={cn("object-contain", className)}
    />
  );
}
