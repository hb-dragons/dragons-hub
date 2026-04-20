const ASPECT = 1432 / 384;

type WordmarkProps = {
  width?: number;
  alt?: string;
  className?: string;
};

export function Wordmark({ width = 220, alt = "Dragons", className }: WordmarkProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static brand SVG; next/image remote-pattern config not warranted
    <img
      src="/brand/wordmark.svg"
      width={width}
      height={width / ASPECT}
      alt={alt}
      className={className}
    />
  );
}
