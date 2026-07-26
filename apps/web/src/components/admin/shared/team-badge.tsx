import { getColorPreset } from "@dragons/shared";
import { cn } from "@dragons/ui/lib/utils";

export interface TeamBadgeProps {
  /** Display name shown inside the badge. */
  name: string;
  /**
   * The team's chosen preset key. Omitting it is not a neutral default: the
   * preset falls back to a hash of `name`, so a team with a configured colour
   * renders differently on every surface that forgets to pass this.
   */
  badgeColor?: string | null;
  className?: string;
}

/**
 * The one team badge. Matches, bookings and reconcile all render through this
 * so a given team is the same colour wherever it appears, in either theme.
 */
export function TeamBadge({ name, badgeColor, className }: TeamBadgeProps) {
  const preset = getColorPreset(badgeColor, name);
  return (
    <span
      data-slot="team-badge"
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold",
        preset.className,
        className,
      )}
    >
      {name}
    </span>
  );
}
