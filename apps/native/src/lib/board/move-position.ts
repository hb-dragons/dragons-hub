/** Where a "move to column" ends up, given the placement the user chose. */
export function moveTargetPosition(args: {
  placement: "top" | "bottom";
  /** Tasks already in the target column, including the moving task. */
  columnTaskCount: number;
  movingWithinColumn: boolean;
}): number {
  if (args.placement === "top") return 0;
  // A task moving inside its own column is part of `columnTaskCount`, so the
  // last index it can occupy is one below the count.
  const lastIndex = args.movingWithinColumn ? args.columnTaskCount - 1 : args.columnTaskCount;
  return Math.max(0, lastIndex);
}
