import WordmarkSvg from "../../../assets/brand/wordmark.svg";

const ASPECT = 1432 / 384;

type WordmarkProps = {
  width?: number;
};

export function Wordmark({ width = 220 }: WordmarkProps) {
  return <WordmarkSvg width={width} height={width / ASPECT} />;
}
