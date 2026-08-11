import { SymbolView } from "expo-symbols";
import { ICONS, type IconName } from "@/lib/ui/icons";

export interface IconProps {
  /** Which role the icon plays; the symbol for it lives in `lib/ui/icons.ts`. */
  name: IconName;
  /** Point size of the symbol. Matches the surrounding text size, not the tap target. */
  size?: number;
  /** Tint. Required: an untinted symbol falls back to the library's own blue. */
  color: string;
}

/**
 * The app's chrome icon, and the only module allowed to render `SymbolView`
 * (#221; enforced by `lib/nav/architecture.test.ts`).
 *
 * `expo-symbols` is beta and says so, which the modernization spec (#212)
 * accepted on the same terms as the alpha native-tabs API: the import lives in
 * one wrapper, so a breaking change to the component is a one-file fix. Call
 * sites name a role from `lib/ui/icons.ts` and never a symbol.
 *
 * The icon carries no accessibility of its own. It is always drawn inside a
 * control that already has the label — a `Pressable` with an
 * `accessibilityLabel`, or a row of text — and a second announcement of the
 * same thing is noise. VoiceOver merges the children of an accessible view,
 * and `SymbolView` contributes no text to merge.
 *
 * No `style` prop, deliberately: `SymbolView` sizes itself to a `size`-square
 * box, and every call site so far wants exactly that inside a container that
 * already positions it. Layout belongs to the container.
 */
export function Icon({ name, size = 20, color }: IconProps) {
  return <SymbolView name={ICONS[name]} size={size} tintColor={color} />;
}
