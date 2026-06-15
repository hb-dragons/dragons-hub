import Svg, { Path, Rect } from "react-native-svg";

/** Up-arrow (send). Stroked, like the other inline icons in this app. */
export function ArrowUpIcon({ size = 20, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 19V5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5 12l7-7 7 7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Filled rounded square (stop generating). */
export function StopIcon({ size = 20, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={7} y={7} width={10} height={10} rx={2} fill={color} />
    </Svg>
  );
}
