const ASPECT = 1421.61 / 1894.29;

type LogoProps = {
  size?: number;
  width?: number;
  alt?: string;
  className?: string;
};

export function Logo({ size, width, alt = "Dragons logo", className }: LogoProps) {
  const w = width ?? (size ?? 56) * ASPECT;
  const h = width !== undefined ? width / ASPECT : (size ?? 56);
  return (
    <img
      src="/brand/logo.svg"
      width={w}
      height={h}
      alt={alt}
      className={className}
    />
  );
}
