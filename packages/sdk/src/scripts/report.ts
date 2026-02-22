import type { ShapeDiff } from "./shape-diff";
import { shapeToString, type ShapeNode } from "./shape-diff";

interface EndpointResult {
  name: string;
  diffs: ShapeDiff[];
  error?: string;
  skipped?: boolean;
  baselineShape?: ShapeNode;
  liveShape?: ShapeNode;
}

export function printReport(results: EndpointResult[], verbose: boolean): boolean {
  let hasDrift = false;

  console.log("\n" + "=".repeat(60));
  console.log("  SDK Type Drift Report");
  console.log("=".repeat(60));

  for (const result of results) {
    console.log(`\n--- ${result.name} ---`);

    if (result.skipped) {
      console.log(`  SKIPPED: ${result.error}`);
      continue;
    }

    if (result.error) {
      console.log(`  ERROR: ${result.error}`);
      hasDrift = true;
      continue;
    }

    if (verbose && result.baselineShape && result.liveShape) {
      console.log("\n  Baseline shape:");
      console.log(indent(shapeToString(result.baselineShape), 4));
      console.log("\n  Live shape:");
      console.log(indent(shapeToString(result.liveShape), 4));
    }

    const added = result.diffs.filter((d) => d.kind === "added");
    const removed = result.diffs.filter((d) => d.kind === "removed");
    const changed = result.diffs.filter((d) => d.kind === "type_changed");

    if (result.diffs.length === 0) {
      console.log("  No drift detected");
      continue;
    }

    hasDrift = true;

    if (added.length > 0) {
      console.log(`\n  New fields (${added.length}):`);
      for (const d of added) {
        console.log(`    + ${d.path} (${d.liveType})`);
      }
    }

    if (removed.length > 0) {
      console.log(`\n  Removed fields (${removed.length}):`);
      for (const d of removed) {
        console.log(`    - ${d.path} (was ${d.baselineType})`);
      }
    }

    if (changed.length > 0) {
      console.log(`\n  Type changes (${changed.length}):`);
      for (const d of changed) {
        console.log(`    ~ ${d.path}: ${d.baselineType} -> ${d.liveType}`);
      }
    }
  }

  // Summary table
  console.log("\n" + "=".repeat(60));
  console.log("  Summary");
  console.log("-".repeat(60));
  console.log(
    `  ${"Endpoint".padEnd(20)} ${"Added".padEnd(8)} ${"Removed".padEnd(8)} ${"Changed".padEnd(8)} Status`,
  );
  console.log("-".repeat(60));

  for (const result of results) {
    if (result.skipped) {
      console.log(`  ${result.name.padEnd(20)} ${"—".padEnd(8)} ${"—".padEnd(8)} ${"—".padEnd(8)} SKIPPED`);
      continue;
    }
    if (result.error) {
      console.log(`  ${result.name.padEnd(20)} ${"—".padEnd(8)} ${"—".padEnd(8)} ${"—".padEnd(8)} ERROR`);
      continue;
    }

    const added = result.diffs.filter((d) => d.kind === "added").length;
    const removed = result.diffs.filter((d) => d.kind === "removed").length;
    const changed = result.diffs.filter((d) => d.kind === "type_changed").length;
    const status = result.diffs.length === 0 ? "OK" : "DRIFT";

    console.log(
      `  ${result.name.padEnd(20)} ${String(added).padEnd(8)} ${String(removed).padEnd(8)} ${String(changed).padEnd(8)} ${status}`,
    );
  }

  console.log("=".repeat(60));

  if (hasDrift) {
    console.log("\nDrift detected. Run with --update-samples to update sample files.\n");
  } else {
    console.log("\nNo drift detected. All samples match live API responses.\n");
  }

  return hasDrift;
}

function indent(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => pad + line)
    .join("\n");
}
