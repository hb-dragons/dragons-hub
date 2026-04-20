import LogoSvg from "../../../assets/brand/logo.svg";

const ASPECT = 1421.61 / 1894.29;

type LogoProps = {
  size?: number;
  width?: number;
};

export function Logo({ size, width }: LogoProps) {
  if (width !== undefined) {
    return <LogoSvg width={width} height={width / ASPECT} />;
  }
  const h = size ?? 56;
  return <LogoSvg width={h * ASPECT} height={h} />;
}
